require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Resend } = require("resend");

// ==================================================
// SUPABASE
// ==================================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================================================
// EXPRESS
// ==================================================

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ==================================================
// ENVIRONMENT
// ==================================================

const PORT = process.env.PORT || 3000;

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

// ==================================================
// HELPER FUNCTIONS
// ==================================================

function cleanEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
    return String(name || "").trim();
}

function cleanValue(value) {
    return String(value || "").trim();
}

function normalizeName(name) {
    return cleanName(name).toLowerCase().replace(/\s+/g, " ");
}

function cleanRentedBy(value) {
    const valueClean = cleanName(value);

    if (
        !valueClean ||
        valueClean.toLowerCase() === "null" ||
        valueClean.toLowerCase() === "undefined"
    ) {
        return "";
    }

    return valueClean;
}

// ==================================================
// INDIA DATE RANGE
// ==================================================

function getIndiaDateRange() {
    const now = new Date();

    const indiaDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);

    const [year, month, day] = indiaDate.split("-").map(Number);

    const todayUTC = new Date(
        Date.UTC(year, month - 1, day)
    );

    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);

    const tomorrowYear = tomorrowUTC.getUTCFullYear();
    const tomorrowMonth = String(
        tomorrowUTC.getUTCMonth() + 1
    ).padStart(2, "0");

    const tomorrowDay = String(
        tomorrowUTC.getUTCDate()
    ).padStart(2, "0");

    const tomorrow =
        `${tomorrowYear}-${tomorrowMonth}-${tomorrowDay}`;

    return {
        today: indiaDate,
        start: `${indiaDate}T00:00:00+05:30`,
        end: `${tomorrow}T00:00:00+05:30`
    };
}

// ==================================================
// FORMAT ATTENDANCE
// ==================================================

function formatAttendance(record) {
    if (!record) return null;

    const dateSource =
        record.entry_time ||
        record.created_at ||
        null;

    let date = "";

    if (dateSource) {
        date = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date(dateSource));
    }

    return {
        ID: record.id,
        Name: record.name || "",
        Email: record.email || "",
        Date: date,
        EntryTime: record.entry_time || null,
        ExitTime: record.exit_time || null,
        Status: record.status || ""
    };
}

// ==================================================
// FIND USER
// ==================================================

async function findUserByEmail(email) {
    const cleanUserEmail = cleanEmail(email);

    if (!cleanUserEmail) {
        return null;
    }

    const { data, error } = await supabase
        .from("users")
        .select("id, name, email, phone")
        .eq("email", cleanUserEmail)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data || null;
}

// ==================================================
// RESOLVE USER DETAILS
// ==================================================

async function resolveUserDetails(name, email) {
    const cleanUserEmail = cleanEmail(email);
    let cleanUserName = cleanName(name);
    let userId = null;

    if (!cleanUserEmail) {
        throw new Error("Email is required.");
    }

    const user = await findUserByEmail(cleanUserEmail);

    if (user) {
        userId = user.id;

        if (!cleanUserName) {
            cleanUserName = cleanName(user.name);
        }
    }

    if (!cleanUserName) {
        throw new Error("Name and email are required.");
    }

    return {
        cleanUserName,
        cleanUserEmail,
        userId
    };
}

// ==================================================
// MARK LOGIN ATTENDANCE
// ==================================================

async function markLoginAttendance(name, email, userId = null) {
    const cleanUserEmail = cleanEmail(email);
    let cleanUserName = cleanName(name);
    let resolvedUserId = userId;

    if (!cleanUserEmail) {
        throw new Error("Email is required.");
    }

    if (!cleanUserName || !resolvedUserId) {
        const user = await findUserByEmail(cleanUserEmail);

        if (user) {
            if (!cleanUserName) {
                cleanUserName = cleanName(user.name);
            }

            if (!resolvedUserId) {
                resolvedUserId = user.id;
            }
        }
    }

    if (!cleanUserName) {
        throw new Error("Name and email are required.");
    }

    const { start, end } = getIndiaDateRange();

    // ----------------------------------------------
    // CHECK TODAY'S ATTENDANCE
    // ----------------------------------------------

    const { data: existing, error: existingError } =
        await supabase
            .from("attendance")
            .select("*")
            .eq("email", cleanUserEmail)
            .gte("entry_time", start)
            .lt("entry_time", end)
            .order("entry_time", {
                ascending: false
            })
            .limit(1);

    if (existingError) {
        throw existingError;
    }

    if (existing && existing.length > 0) {
        return {
            success: true,
            alreadyMarked: true,
            attendance: formatAttendance(existing[0])
        };
    }

    // ----------------------------------------------
    // INSERT ATTENDANCE
    // ----------------------------------------------

    const { data, error } = await supabase
        .from("attendance")
        .insert([
            {
                user_id: resolvedUserId
                    ? String(resolvedUserId)
                    : cleanUserEmail,

                name: cleanUserName,
                email: cleanUserEmail,
                entry_time: new Date().toISOString(),
                exit_time: null,
                status: "Present"
            }
        ])
        .select()
        .single();

    if (error) {
        throw error;
    }

    return {
        success: true,
        alreadyMarked: false,
        attendance: formatAttendance(data)
    };
}

// ==================================================
// GET USER ATTENDANCE
// ==================================================

async function getAttendanceByEmail(email) {
    const cleanUserEmail = cleanEmail(email);

    if (!cleanUserEmail) {
        throw new Error("Email is required.");
    }

    const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("email", cleanUserEmail)
        .order("entry_time", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return (data || []).map(formatAttendance);
}

// ==================================================
// CHECK ACTIVE RENTALS
// ==================================================

async function getActiveRentalInfo(email, userName = "") {
    const cleanUserEmail = cleanEmail(email);
    const currentUserName = normalizeName(userName);

    const { data: transactions, error } = await supabase
        .from("transactions")
        .select(
            "id, name, book_name, rent_date, submit_date, status, email, author"
        )
        .eq("email", cleanUserEmail)
        .eq("status", "RENTED")
        .is("submit_date", null)
        .order("rent_date", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    const actualActive = [];
    const staleTransactions = [];

    for (const transaction of transactions || []) {

        // ------------------------------------------
        // IMPORTANT:
        // books table uses "name", NOT "title"
        // ------------------------------------------

        const { data: book, error: bookError } =
            await supabase
                .from("books")
                .select("id, name, author, rented_by")
                .eq("name", transaction.book_name)
                .maybeSingle();

        if (bookError) {
            throw bookError;
        }

        const renterName = cleanRentedBy(
            book?.rented_by
        );

        const normalizedRenter =
            normalizeName(renterName);

        const transactionName =
            normalizeName(transaction.name);

        const belongsToUser =
            normalizedRenter &&
            (
                normalizedRenter === currentUserName ||
                normalizedRenter === transactionName
            );

        if (book && belongsToUser) {
            actualActive.push({
                transaction,
                book
            });
        } else {
            // Transaction says RENTED but the book is
            // currently not actually marked as rented.
            staleTransactions.push(transaction);
        }
    }

    return {
        actualActive,
        staleTransactions
    };
}

// ==================================================
// HEALTH
// ==================================================

app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "Atal Library backend is running successfully."
    });
});

// ==================================================
// ROOT
// ==================================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Atal Library API is running."
    });
});

// ==================================================
// REGISTER
// ==================================================

app.post("/register", async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password
        } = req.body;

        const cleanUserName = cleanName(name);
        const cleanUserEmail = cleanEmail(email);
        const cleanPhone = cleanValue(phone);
        const cleanPassword = String(password || "");

        if (
            !cleanUserName ||
            !cleanUserEmail ||
            !cleanPassword
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        // ------------------------------------------
        // CHECK DUPLICATE EMAIL
        // ------------------------------------------

        const { data: existingUser, error: existingError } =
            await supabase
                .from("users")
                .select("id")
                .eq("email", cleanUserEmail)
                .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "You have already registered please login."
            });
        }

        // ------------------------------------------
        // INSERT USER
        // ------------------------------------------

        const { data, error } = await supabase
            .from("users")
            .insert([
                {
                    name: cleanUserName,
                    email: cleanUserEmail,
                    phone: cleanPhone,
                    password: cleanPassword
                }
            ])
            .select("id, name, email, phone")
            .single();

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            message: "Registration successful.",
            user: data
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to register.",
            error: error.message
        });
    }
});

// ==================================================
// LOGIN
// ==================================================

app.post("/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        const cleanUserEmail = cleanEmail(email);
        const cleanPassword = String(password || "");

        if (!cleanUserEmail || !cleanPassword) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", cleanUserEmail)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (String(user.password) !== cleanPassword) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        // ------------------------------------------
        // MARK ATTENDANCE
        // ------------------------------------------

        try {
            await markLoginAttendance(
                user.name,
                user.email,
                user.id
            );
        } catch (attendanceError) {
            console.error(
                "LOGIN ATTENDANCE ERROR:",
                attendanceError
            );
        }

        return res.json({
            success: true,
            message: "Login successful.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to login.",
            error: error.message
        });
    }
});

// ==================================================
// ATTENDANCE - GENERIC
// ==================================================

app.post("/attendance", async (req, res) => {
    try {
        const {
            name,
            email
        } = req.body;

        const {
            cleanUserName,
            cleanUserEmail,
            userId
        } = await resolveUserDetails(
            name,
            email
        );

        const result = await markLoginAttendance(
            cleanUserName,
            cleanUserEmail,
            userId
        );

        return res.json(result);

    } catch (error) {
        console.error(
            "ATTENDANCE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to mark attendance.",
            error: error.message
        });
    }
});

// ==================================================
// ATTENDANCE ENTER
// ==================================================

app.post("/attendance/enter", async (req, res) => {
    try {
        const {
            name,
            email
        } = req.body;

        // ------------------------------------------
        // EMAIL REQUIRED
        // NAME CAN BE FOUND FROM USERS TABLE
        // ------------------------------------------

        const cleanUserEmail = cleanEmail(email);
        let cleanUserName = cleanName(name);
        let userId = null;

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const user = await findUserByEmail(
            cleanUserEmail
        );

        if (user) {
            userId = user.id;

            if (!cleanUserName) {
                cleanUserName = cleanName(user.name);
            }
        }

        if (!cleanUserName) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required."
            });
        }

        const { start, end } =
            getIndiaDateRange();

        // ------------------------------------------
        // CHECK TODAY
        // ------------------------------------------

        const { data: existing, error: existingError } =
            await supabase
                .from("attendance")
                .select("*")
                .eq("email", cleanUserEmail)
                .gte("entry_time", start)
                .lt("entry_time", end)
                .order("entry_time", {
                    ascending: false
                })
                .limit(1);

        if (existingError) {
            throw existingError;
        }

        if (existing && existing.length > 0) {
            return res.json({
                success: true,
                alreadyMarked: true,
                message: "Today's attendance is already marked.",
                attendance: formatAttendance(
                    existing[0]
                )
            });
        }

        // ------------------------------------------
        // INSERT
        // ------------------------------------------

        const { data, error } = await supabase
            .from("attendance")
            .insert([
                {
                    user_id: userId
                        ? String(userId)
                        : cleanUserEmail,

                    name: cleanUserName,
                    email: cleanUserEmail,
                    entry_time: new Date().toISOString(),
                    exit_time: null,
                    status: "Present"
                }
            ])
            .select()
            .single();

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            message: "Attendance marked successfully.",
            attendance: formatAttendance(data)
        });

    } catch (error) {
        console.error(
            "ATTENDANCE ENTER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to mark attendance.",
            error: error.message
        });
    }
});

// ==================================================
// ATTENDANCE EXIT
// ==================================================

app.post("/attendance/exit", async (req, res) => {
    try {
        const {
            email
        } = req.body;

        const cleanUserEmail =
            cleanEmail(email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const { start, end } =
            getIndiaDateRange();

        // ------------------------------------------
        // FIND TODAY'S ATTENDANCE
        // ------------------------------------------

        const { data: records, error } =
            await supabase
                .from("attendance")
                .select("*")
                .eq("email", cleanUserEmail)
                .gte("entry_time", start)
                .lt("entry_time", end)
                .order("entry_time", {
                    ascending: false
                })
                .limit(1);

        if (error) {
            throw error;
        }

        if (!records || records.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Today's attendance not found."
            });
        }

        const record = records[0];

        if (record.exit_time) {
            return res.json({
                success: true,
                message: "Exit attendance is already marked.",
                attendance: formatAttendance(record)
            });
        }

        // ------------------------------------------
        // UPDATE EXIT
        // ------------------------------------------

        const { data: updated, error: updateError } =
            await supabase
                .from("attendance")
                .update({
                    exit_time: new Date().toISOString(),
                    status: "Completed"
                })
                .eq("id", record.id)
                .select()
                .single();

        if (updateError) {
            throw updateError;
        }

        return res.json({
            success: true,
            message: "Exit attendance marked successfully.",
            attendance: formatAttendance(updated)
        });

    } catch (error) {
        console.error(
            "ATTENDANCE EXIT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to mark exit attendance.",
            error: error.message
        });
    }
});

// ==================================================
// ATTENDANCE STATUS
// ==================================================
// IMPORTANT:
// This route DOES NOT use attendance.date.
// It uses entry_time because the attendance table
// does not have a "date" column.
// ==================================================

app.get("/attendance/status", async (req, res) => {
    try {
        const cleanUserEmail =
            cleanEmail(req.query.email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const { start, end } =
            getIndiaDateRange();

        const { data: records, error } =
            await supabase
                .from("attendance")
                .select("*")
                .eq("email", cleanUserEmail)
                .gte("entry_time", start)
                .lt("entry_time", end)
                .order("entry_time", {
                    ascending: false
                })
                .limit(1);

        if (error) {
            throw error;
        }

        if (!records || records.length === 0) {
            return res.json({
                success: true,
                marked: false,
                attendance: null
            });
        }

        return res.json({
            success: true,
            marked: true,
            attendance: formatAttendance(
                records[0]
            )
        });

    } catch (error) {
        console.error(
            "ATTENDANCE STATUS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get attendance.",
            error: error.message
        });
    }
});

// ==================================================
// GET ATTENDANCE BY EMAIL
// ==================================================

app.get("/attendance/:email", async (req, res) => {
    try {
        const cleanUserEmail =
            cleanEmail(req.params.email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const attendance =
            await getAttendanceByEmail(
                cleanUserEmail
            );

        return res.json({
            success: true,
            attendance
        });

    } catch (error) {
        console.error(
            "GET ATTENDANCE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get attendance.",
            error: error.message
        });
    }
});

// ==================================================
// ADMIN ATTENDANCE
// ==================================================

app.get("/admin/attendance", async (req, res) => {
    try {
        const { data, error } =
            await supabase
                .from("attendance")
                .select("*")
                .order("entry_time", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            attendance: (data || []).map(
                formatAttendance
            )
        });

    } catch (error) {
        console.error(
            "ADMIN ATTENDANCE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get attendance.",
            error: error.message
        });
    }
});

// ==================================================
// ADMIN ATTENDANCE ALIAS
// ==================================================

app.get("/attendance/admin", async (req, res) => {
    try {
        const { data, error } =
            await supabase
                .from("attendance")
                .select("*")
                .order("entry_time", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            attendance: (data || []).map(
                formatAttendance
            )
        });

    } catch (error) {
        console.error(
            "ATTENDANCE ADMIN ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get attendance.",
            error: error.message
        });
    }
});

// ==================================================
// BOOKS - GET ALL
// ==================================================

app.get("/books", async (req, res) => {
    try {
        const { data, error } =
            await supabase
                .from("books")
                .select("*")
                .order("id", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            books: data || []
        });

    } catch (error) {
        console.error(
            "GET BOOKS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get books.",
            error: error.message
        });
    }
});

// ==================================================
// ADD BOOK
// ==================================================

app.post("/books", async (req, res) => {
    try {
        const {
            name,
            author,
            category,
            year,
            image,
            description,
            price,
            created_by
        } = req.body;

        const cleanBookName =
            cleanValue(name);

        if (!cleanBookName) {
            return res.status(400).json({
                success: false,
                message: "Book name is required."
            });
        }

        const { data, error } =
            await supabase
                .from("books")
                .insert([
                    {
                        name: cleanBookName,
                        author: cleanValue(author),
                        category: cleanValue(category),
                        year: year
                            ? Number(year)
                            : null,
                        image: cleanValue(image),
                        description:
                            cleanValue(description),
                        rented_by: null,
                        created_by:
                            created_by
                                ? created_by
                                : new Date().toISOString(),
                        price:
                            price !== undefined &&
                            price !== ""
                                ? Number(price)
                                : 0
                    }
                ])
                .select()
                .single();

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            message: "Book added successfully.",
            book: data
        });

    } catch (error) {
        console.error(
            "ADD BOOK ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to add book.",
            error: error.message
        });
    }
});

// ==================================================
// DELETE BOOK
// ==================================================

app.delete("/books/:id", async (req, res) => {
    try {
        const bookId = req.params.id;

        const { data: book, error: bookError } =
            await supabase
                .from("books")
                .select("*")
                .eq("id", bookId)
                .maybeSingle();

        if (bookError) {
            throw bookError;
        }

        if (!book) {
            return res.status(404).json({
                success: false,
                message: "Book not found."
            });
        }

        if (cleanRentedBy(book.rented_by)) {
            return res.status(400).json({
                success: false,
                message: "You cannot delete a rented book."
            });
        }

        const { error } =
            await supabase
                .from("books")
                .delete()
                .eq("id", bookId);

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            message: "Book deleted successfully."
        });

    } catch (error) {
        console.error(
            "DELETE BOOK ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to delete book.",
            error: error.message
        });
    }
});

// ==================================================
// RENT BOOK
// ==================================================

app.post("/rent", async (req, res) => {
    try {
        const {
            name,
            email,
            book_name,
            author
        } = req.body;

        const cleanUserName =
            cleanName(name);

        const cleanUserEmail =
            cleanEmail(email);

        const cleanBookName =
            cleanValue(book_name);

        const cleanAuthor =
            cleanValue(author);

        if (
            !cleanUserName ||
            !cleanUserEmail ||
            !cleanBookName
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email and book name are required."
            });
        }

        // ------------------------------------------
        // FIND BOOK
        // IMPORTANT: books uses "name"
        // ------------------------------------------

        const { data: book, error: bookError } =
            await supabase
                .from("books")
                .select("*")
                .eq("name", cleanBookName)
                .maybeSingle();

        if (bookError) {
            throw bookError;
        }

        if (!book) {
            return res.status(404).json({
                success: false,
                message: "Book not found."
            });
        }

        // ------------------------------------------
        // ACTUAL BOOK AVAILABILITY
        // ------------------------------------------

        if (cleanRentedBy(book.rented_by)) {
            return res.status(400).json({
                success: false,
                message: "This book is already rented."
            });
        }

        // ------------------------------------------
        // CHECK USER'S EXISTING ACTIVE TRANSACTION
        // ------------------------------------------

        const { data: existingRental, error: rentalError } =
            await supabase
                .from("transactions")
                .select("id, book_name, status, submit_date")
                .eq("email", cleanUserEmail)
                .eq("book_name", cleanBookName)
                .eq("status", "RENTED")
                .is("submit_date", null)
                .limit(1);

        if (rentalError) {
            throw rentalError;
        }

        if (
            existingRental &&
            existingRental.length > 0
        ) {
            return res.status(400).json({
                success: false,
                message: "You have already rented this book."
            });
        }

        // ------------------------------------------
        // INSERT TRANSACTION
        // ------------------------------------------

        const { data: transaction, error: transactionError } =
            await supabase
                .from("transactions")
                .insert([
                    {
                        name: cleanUserName,
                        book_name: cleanBookName,
                        rent_date:
                            new Date().toISOString(),
                        submit_date: null,
                        status: "RENTED",
                        email: cleanUserEmail,
                        author:
                            cleanAuthor ||
                            cleanValue(book.author)
                    }
                ])
                .select()
                .single();

        if (transactionError) {
            throw transactionError;
        }

        // ------------------------------------------
        // UPDATE BOOK
        // ------------------------------------------

        const { error: updateBookError } =
            await supabase
                .from("books")
                .update({
                    rented_by: cleanUserName
                })
                .eq("id", book.id);

        if (updateBookError) {
            // Rollback transaction if book update fails
            await supabase
                .from("transactions")
                .delete()
                .eq("id", transaction.id);

            throw updateBookError;
        }

        return res.json({
            success: true,
            message: "Book rented successfully.",
            transaction
        });

    } catch (error) {
        console.error(
            "RENT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to rent book.",
            error: error.message
        });
    }
});

// ==================================================
// MY RENTALS
// ==================================================

app.get("/rentals", async (req, res) => {
    try {
        const cleanUserEmail =
            cleanEmail(req.query.email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        // ------------------------------------------
        // ONLY ACTIVE RENTALS
        // ------------------------------------------

        const { data, error } =
            await supabase
                .from("transactions")
                .select("*")
                .eq("email", cleanUserEmail)
                .eq("status", "RENTED")
                .is("submit_date", null)
                .order("rent_date", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            rentals: data || []
        });

    } catch (error) {
        console.error(
            "MY RENTALS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get rentals.",
            error: error.message
        });
    }
});

// ==================================================
// MY RENTALS ALIAS
// ==================================================

app.get("/my-rentals", async (req, res) => {
    try {
        const cleanUserEmail =
            cleanEmail(req.query.email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const { data, error } =
            await supabase
                .from("transactions")
                .select("*")
                .eq("email", cleanUserEmail)
                .eq("status", "RENTED")
                .is("submit_date", null)
                .order("rent_date", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            rentals: data || []
        });

    } catch (error) {
        console.error(
            "MY RENTALS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get rentals.",
            error: error.message
        });
    }
});

// ==================================================
// SUBMIT / RETURN BOOK
// ==================================================

app.post("/submit", async (req, res) => {
    try {
        const {
            email,
            book_name
        } = req.body;

        const cleanUserEmail =
            cleanEmail(email);

        const cleanBookName =
            cleanValue(book_name);

        if (
            !cleanUserEmail ||
            !cleanBookName
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and book name are required."
            });
        }

        // ------------------------------------------
        // FIND ACTIVE TRANSACTION
        // ------------------------------------------

        const { data: transactions, error } =
            await supabase
                .from("transactions")
                .select("*")
                .eq("email", cleanUserEmail)
                .eq("book_name", cleanBookName)
                .eq("status", "RENTED")
                .is("submit_date", null)
                .order("rent_date", {
                    ascending: false
                })
                .limit(1);

        if (error) {
            throw error;
        }

        if (
            !transactions ||
            transactions.length === 0
        ) {
            return res.status(404).json({
                success: false,
                message: "No active rental found for this book."
            });
        }

        const transaction = transactions[0];

        // ------------------------------------------
        // SUBMIT TRANSACTION
        // ------------------------------------------

        const submitDate =
            new Date().toISOString();

        const { data: updatedTransaction, error: updateError } =
            await supabase
                .from("transactions")
                .update({
                    status: "SUBMITTED",
                    submit_date: submitDate
                })
                .eq("id", transaction.id)
                .select()
                .single();

        if (updateError) {
            throw updateError;
        }

        // ------------------------------------------
        // FIND BOOK
        // IMPORTANT: books uses "name"
        // ------------------------------------------

        const { data: book, error: bookError } =
            await supabase
                .from("books")
                .select("id, name, rented_by")
                .eq("name", cleanBookName)
                .maybeSingle();

        if (bookError) {
            throw bookError;
        }

        if (book) {
            const currentRenter =
                normalizeName(
                    cleanRentedBy(book.rented_by)
                );

            const transactionRenter =
                normalizeName(
                    transaction.name
                );

            // Only clear if this transaction's
            // renter is actually the current renter.
            if (
                !currentRenter ||
                currentRenter === transactionRenter
            ) {
                const { error: clearError } =
                    await supabase
                        .from("books")
                        .update({
                            rented_by: null
                        })
                        .eq("id", book.id);

                if (clearError) {
                    throw clearError;
                }
            }
        }

        return res.json({
            success: true,
            message: "Book submitted successfully.",
            transaction: updatedTransaction
        });

    } catch (error) {
        console.error(
            "SUBMIT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to submit book.",
            error: error.message
        });
    }
});

// ==================================================
// ALL TRANSACTIONS
// ==================================================

app.get("/transactions", async (req, res) => {
    try {
        const cleanUserEmail =
            cleanEmail(req.query.email);

        let query = supabase
            .from("transactions")
            .select("*")
            .order("rent_date", {
                ascending: false
            });

        if (cleanUserEmail) {
            query = query.eq(
                "email",
                cleanUserEmail
            );
        }

        const { data, error } =
            await query;

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            transactions: data || []
        });

    } catch (error) {
        console.error(
            "TRANSACTIONS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get transactions.",
            error: error.message
        });
    }
});

// ==================================================
// ACCOUNT DELETE
// ==================================================

app.delete("/account", async (req, res) => {
    try {
        const {
            email
        } = req.body;

        const cleanUserEmail =
            cleanEmail(email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        // ------------------------------------------
        // GET USER
        // ------------------------------------------

        const user =
            await findUserByEmail(
                cleanUserEmail
            );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        // ------------------------------------------
        // CHECK ACTUAL ACTIVE RENTALS
        // ------------------------------------------

        const rentalInfo =
            await getActiveRentalInfo(
                cleanUserEmail,
                user.name
            );

        // ------------------------------------------
        // ONLY ACTUAL BOOK RENTALS BLOCK DELETE
        // ------------------------------------------

        if (
            rentalInfo.actualActive &&
            rentalInfo.actualActive.length > 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "You cannot delete your account while you have a rented book. Please submit the book first.",
                rentals:
                    rentalInfo.actualActive.map(
                        item => ({
                            book_name:
                                item.transaction.book_name,
                            rent_date:
                                item.transaction.rent_date
                        })
                    )
            });
        }

        // ------------------------------------------
        // DELETE STALE RENTAL RECORDS
        // ------------------------------------------

        for (
            const transaction
            of rentalInfo.staleTransactions || []
        ) {
            const { error: staleDeleteError } =
                await supabase
                    .from("transactions")
                    .delete()
                    .eq("id", transaction.id);

            if (staleDeleteError) {
                throw staleDeleteError;
            }
        }

        // ------------------------------------------
        // DELETE ATTENDANCE
        // ------------------------------------------

        const { error: attendanceError } =
            await supabase
                .from("attendance")
                .delete()
                .eq("email", cleanUserEmail);

        if (attendanceError) {
            throw attendanceError;
        }

        // ------------------------------------------
        // DELETE TRANSACTIONS
        // ------------------------------------------

        const { error: transactionError } =
            await supabase
                .from("transactions")
                .delete()
                .eq("email", cleanUserEmail);

        if (transactionError) {
            throw transactionError;
        }

        // ------------------------------------------
        // DELETE USER
        // ------------------------------------------

        const { error: userDeleteError } =
            await supabase
                .from("users")
                .delete()
                .eq("id", user.id);

        if (userDeleteError) {
            throw userDeleteError;
        }

        return res.json({
            success: true,
            message: "Account deleted successfully."
        });

    } catch (error) {
        console.error(
            "ACCOUNT DELETE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to delete account.",
            error: error.message
        });
    }
});

// ==================================================
// ADMIN LOGIN
// ==================================================

app.post("/admin/login", async (req, res) => {
    try {
        const {
            username,
            password
        } = req.body;

        const adminUsername =
            String(
                process.env.ADMIN_USERNAME || ""
            ).trim();

        const adminPassword =
            String(
                process.env.ADMIN_PASSWORD || ""
            );

        if (
            String(username || "").trim() !==
                adminUsername ||
            String(password || "") !==
                adminPassword
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin username or password."
            });
        }

        return res.json({
            success: true,
            message: "Admin login successful."
        });

    } catch (error) {
        console.error(
            "ADMIN LOGIN ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to login as admin.",
            error: error.message
        });
    }
});

// ==================================================
// ADMIN USERS
// ==================================================

app.get("/admin/users", async (req, res) => {
    try {
        const { data, error } =
            await supabase
                .from("users")
                .select(
                    "id, name, email, phone"
                )
                .order("id", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            users: data || []
        });

    } catch (error) {
        console.error(
            "ADMIN USERS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to get users.",
            error: error.message
        });
    }
});

// ==================================================
// ADMIN DELETE USER
// ==================================================

app.delete("/admin/users/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        // ------------------------------------------
        // GET USER
        // ------------------------------------------

        const { data: user, error: userError } =
            await supabase
                .from("users")
                .select("*")
                .eq("id", userId)
                .maybeSingle();

        if (userError) {
            throw userError;
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // ------------------------------------------
        // CHECK ACTUAL ACTIVE RENTALS
        // ------------------------------------------

        const rentalInfo =
            await getActiveRentalInfo(
                user.email,
                user.name
            );

        if (
            rentalInfo.actualActive &&
            rentalInfo.actualActive.length > 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "This user has a rented book. Please submit the book first."
            });
        }

        // ------------------------------------------
        // CLEAN STALE RENTALS
        // ------------------------------------------

        for (
            const transaction
            of rentalInfo.staleTransactions || []
        ) {
            const { error } =
                await supabase
                    .from("transactions")
                    .delete()
                    .eq("id", transaction.id);

            if (error) {
                throw error;
            }
        }

        // ------------------------------------------
        // DELETE ATTENDANCE
        // ------------------------------------------

        const { error: attendanceError } =
            await supabase
                .from("attendance")
                .delete()
                .eq("email", user.email);

        if (attendanceError) {
            throw attendanceError;
        }

        // ------------------------------------------
        // DELETE TRANSACTIONS
        // ------------------------------------------

        const { error: transactionError } =
            await supabase
                .from("transactions")
                .delete()
                .eq("email", user.email);

        if (transactionError) {
            throw transactionError;
        }

        // ------------------------------------------
        // DELETE USER
        // ------------------------------------------

        const { error: deleteError } =
            await supabase
                .from("users")
                .delete()
                .eq("id", userId);

        if (deleteError) {
            throw deleteError;
        }

        return res.json({
            success: true,
            message: "User deleted successfully."
        });

    } catch (error) {
        console.error(
            "ADMIN DELETE USER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to delete user.",
            error: error.message
        });
    }
});

// ==================================================
// OTP STORE
// ==================================================

const otpStore = new Map();

// ==================================================
// SEND EMAIL OTP
// ==================================================

app.post("/send-email-otp", async (req, res) => {
    try {
        const {
            email
        } = req.body;

        const cleanUserEmail =
            cleanEmail(email);

        if (!cleanUserEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        if (!resend) {
            return res.status(500).json({
                success: false,
                message:
                    "Email service is not configured."
            });
        }

        // ------------------------------------------
        // CHECK EXISTING USER
        // ------------------------------------------

        const existingUser =
            await findUserByEmail(
                cleanUserEmail
            );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message:
                    "You have already registered please login."
            });
        }

        // ------------------------------------------
        // GENERATE OTP
        // ------------------------------------------

        const otp =
            crypto
                .randomInt(100000, 1000000)
                .toString();

        otpStore.set(
            cleanUserEmail,
            {
                otp,
                expiresAt:
                    Date.now() +
                    10 * 60 * 1000
            }
        );

        // ------------------------------------------
        // SEND EMAIL
        // ------------------------------------------

        const fromEmail =
            process.env.RESEND_FROM_EMAIL ||
            "onboarding@resend.dev";

        const { error: resendError } =
            await resend.emails.send({
                from: fromEmail,
                to: [cleanUserEmail],
                subject:
                    "Atal Library - Email Verification OTP",
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
                        <h2>Atal Library</h2>

                        <p>Your email verification OTP is:</p>

                        <div style="
                            font-size:32px;
                            font-weight:bold;
                            letter-spacing:8px;
                            padding:20px;
                            background:#f5f5f5;
                            text-align:center;
                            border-radius:10px;
                        ">
                            ${otp}
                        </div>

                        <p>This OTP will expire in 10 minutes.</p>

                        <p>If you did not request this OTP, you can ignore this email.</p>
                    </div>
                `
            });

        if (resendError) {
            console.error(
                "RESEND ERROR:",
                resendError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to send OTP.",
                error:
                    resendError.message ||
                    String(resendError)
            });
        }

        return res.json({
            success: true,
            message: "OTP sent successfully."
        });

    } catch (error) {
        console.error(
            "SEND OTP ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to send OTP.",
            error: error.message
        });
    }
});

// ==================================================
// VERIFY EMAIL OTP
// ==================================================

app.post("/verify-email-otp", async (req, res) => {
    try {
        const {
            email,
            otp
        } = req.body;

        const cleanUserEmail =
            cleanEmail(email);

        const cleanOtp =
            String(otp || "").trim();

        if (
            !cleanUserEmail ||
            !cleanOtp
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required."
            });
        }

        const stored =
            otpStore.get(
                cleanUserEmail
            );

        if (!stored) {
            return res.status(400).json({
                success: false,
                message:
                    "OTP not found or expired."
            });
        }

        if (
            Date.now() >
            stored.expiresAt
        ) {
            otpStore.delete(
                cleanUserEmail
            );

            return res.status(400).json({
                success: false,
                message: "OTP has expired."
            });
        }

        if (
            stored.otp !== cleanOtp
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });
        }

        otpStore.delete(
            cleanUserEmail
        );

        return res.json({
            success: true,
            message:
                "Email verified successfully."
        });

    } catch (error) {
        console.error(
            "VERIFY OTP ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to verify OTP.",
            error: error.message
        });
    }
});

// ==================================================
// 404 ROUTE
// ==================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message:
            `API route not found: ${req.method} ${req.originalUrl}`
    });
});

// ==================================================
// GLOBAL ERROR HANDLER
// ==================================================

app.use((err, req, res, next) => {
    console.error(
        "GLOBAL SERVER ERROR:",
        err
    );

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        success: false,
        message: "Internal server error.",
        error: err.message
    });
});

// ==================================================
// START SERVER
// ==================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Atal Library server running on port ${PORT}`
        );
    }
);