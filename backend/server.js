require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Resend } = require("resend");

// ==================================================
// ENVIRONMENT
// ==================================================

const PORT = Number(process.env.PORT) || 3000;

const SUPABASE_URL = String(
    process.env.SUPABASE_URL || ""
).trim();

const SUPABASE_SERVICE_ROLE_KEY = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const RESEND_API_KEY = String(
    process.env.RESEND_API_KEY || ""
).trim();

const RESEND_FROM_EMAIL = String(
    process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
).trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        "ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
}

// ==================================================
// SUPABASE
// ==================================================

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
);

// ==================================================
// EXPRESS
// ==================================================

const app = express();

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

// ==================================================
// RESEND
// ==================================================

const resend = RESEND_API_KEY
    ? new Resend(RESEND_API_KEY)
    : null;

// ==================================================
// HELPER FUNCTIONS
// ==================================================

function cleanEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function cleanName(name) {
    return String(name || "")
        .trim();
}

function cleanValue(value) {
    return String(value || "")
        .trim();
}

function normalizeName(name) {
    return cleanName(name)
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function cleanRentedBy(value) {
    const cleaned = cleanName(value);

    if (!cleaned) {
        return "";
    }

    const lower = cleaned.toLowerCase();

    if (
        lower === "null" ||
        lower === "undefined"
    ) {
        return "";
    }

    return cleaned;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sendError(res, status, message, error = null) {
    const response = {
        success: false,
        message
    };

    if (error) {
        response.error =
            error.message ||
            String(error);
    }

    return res.status(status).json(response);
}

// ==================================================
// INDIA DATE HELPERS
// ==================================================

function getIndiaTodayString() {
    const parts = new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day}`;
}

function getIndiaDateRange() {
    const today = getIndiaTodayString();

    const [year, month, day] =
        today.split("-").map(Number);

    const tomorrowDate = new Date(
        Date.UTC(
            year,
            month - 1,
            day + 1
        )
    );

    const tomorrowYear =
        tomorrowDate.getUTCFullYear();

    const tomorrowMonth =
        String(
            tomorrowDate.getUTCMonth() + 1
        ).padStart(2, "0");

    const tomorrowDay =
        String(
            tomorrowDate.getUTCDate()
        ).padStart(2, "0");

    const tomorrow =
        `${tomorrowYear}-${tomorrowMonth}-${tomorrowDay}`;

    return {
        today,
        start: `${today}T00:00:00+05:30`,
        end: `${tomorrow}T00:00:00+05:30`
    };
}

// ==================================================
// FORMAT ATTENDANCE
// ==================================================

function formatAttendance(record) {
    if (!record) {
        return null;
    }

    const dateSource =
        record.entry_time ||
        record.created_at ||
        null;

    let date = "";

    if (dateSource) {
        try {
            date = new Intl.DateTimeFormat(
                "en-IN",
                {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                }
            ).format(
                new Date(dateSource)
            );
        } catch (error) {
            date = "";
        }
    }

    return {
        ID: record.id,
        Name: record.name || "",
        Email: record.email || "",
        Date: date,
        EntryTime:
            record.entry_time || null,
        ExitTime:
            record.exit_time || null,
        Status: record.status || ""
    };
}

// ==================================================
// FIND USER
// ==================================================

async function findUserByEmail(email) {
    const cleanUserEmail =
        cleanEmail(email);

    if (!cleanUserEmail) {
        return null;
    }

    const {
        data,
        error
    } = await supabase
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

async function resolveUserDetails(
    name,
    email
) {
    const cleanUserEmail =
        cleanEmail(email);

    let cleanUserName =
        cleanName(name);

    let userId = null;

    if (!cleanUserEmail) {
        throw new Error(
            "Email is required."
        );
    }

    const user =
        await findUserByEmail(
            cleanUserEmail
        );

    if (user) {
        userId = user.id;

        if (!cleanUserName) {
            cleanUserName =
                cleanName(user.name);
        }
    }

    if (!cleanUserName) {
        throw new Error(
            "Name and email are required."
        );
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

async function markLoginAttendance(
    name,
    email,
    userId = null
) {
    const cleanUserEmail =
        cleanEmail(email);

    let cleanUserName =
        cleanName(name);

    let resolvedUserId =
        userId;

    if (!cleanUserEmail) {
        throw new Error(
            "Email is required."
        );
    }

    if (
        !cleanUserName ||
        !resolvedUserId
    ) {
        const user =
            await findUserByEmail(
                cleanUserEmail
            );

        if (user) {
            if (!cleanUserName) {
                cleanUserName =
                    cleanName(user.name);
            }

            if (!resolvedUserId) {
                resolvedUserId =
                    user.id;
            }
        }
    }

    if (!cleanUserName) {
        throw new Error(
            "Name and email are required."
        );
    }

    const {
        start,
        end
    } = getIndiaDateRange();

    // ==================================================
    // CHECK TODAY'S ATTENDANCE
    // ==================================================

    const {
        data: existing,
        error: existingError
    } = await supabase
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

    if (
        existing &&
        existing.length > 0
    ) {
        return {
            success: true,
            alreadyMarked: true,
            attendance:
                formatAttendance(
                    existing[0]
                )
        };
    }

    // ==================================================
    // INSERT ATTENDANCE
    // ==================================================

    const {
        data,
        error
    } = await supabase
        .from("attendance")
        .insert([
            {
                user_id:
                    resolvedUserId
                        ? String(resolvedUserId)
                        : cleanUserEmail,

                name: cleanUserName,

                email: cleanUserEmail,

                entry_time:
                    new Date().toISOString(),

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
        attendance:
            formatAttendance(data)
    };
}

// ==================================================
// GET USER ATTENDANCE
// ==================================================

async function getAttendanceByEmail(
    email
) {
    const cleanUserEmail =
        cleanEmail(email);

    if (!cleanUserEmail) {
        throw new Error(
            "Email is required."
        );
    }

    const {
        data,
        error
    } = await supabase
        .from("attendance")
        .select("*")
        .eq("email", cleanUserEmail)
        .order("entry_time", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    return (data || [])
        .map(formatAttendance);
}

// ==================================================
// GET ACTIVE RENTAL INFO
// ==================================================

async function getActiveRentalInfo(
    email,
    userName = ""
) {
    const cleanUserEmail =
        cleanEmail(email);

    const currentUserName =
        normalizeName(userName);

    if (!cleanUserEmail) {
        return {
            actualActive: [],
            staleTransactions: []
        };
    }

    const {
        data: transactions,
        error
    } = await supabase
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

    for (
        const transaction
        of transactions || []
    ) {
        const {
            data: book,
            error: bookError
        } = await supabase
            .from("books")
            .select(
                "id, name, author, rented_by"
            )
            .eq(
                "name",
                transaction.book_name
            )
            .maybeSingle();

        if (bookError) {
            throw bookError;
        }

        if (!book) {
            staleTransactions.push(
                transaction
            );
            continue;
        }

        const renterName =
            cleanRentedBy(
                book.rented_by
            );

        const normalizedRenter =
            normalizeName(
                renterName
            );

        const transactionName =
            normalizeName(
                transaction.name
            );

        const belongsToUser =
            normalizedRenter &&
            (
                normalizedRenter ===
                    currentUserName ||

                normalizedRenter ===
                    transactionName
            );

        if (belongsToUser) {
            actualActive.push({
                transaction,
                book
            });
        } else {
            staleTransactions.push(
                transaction
            );
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

app.get(
    "/health",
    (req, res) => {
        return res.json({
            success: true,
            message:
                "Atal Library backend is running successfully.",
            port: PORT
        });
    }
);

// ==================================================
// ROOT
// ==================================================

app.get(
    "/",
    (req, res) => {
        return res.json({
            success: true,
            message:
                "Atal Library API is running."
        });
    }
);

// ==================================================
// REGISTER
// ==================================================

app.post(
    "/register",
    async (req, res) => {
        try {
            const {
                name,
                email,
                phone,
                password
            } = req.body;

            const cleanUserName =
                cleanName(name);

            const cleanUserEmail =
                cleanEmail(email);

            const cleanPhone =
                cleanValue(phone);

            const cleanPassword =
                String(password || "");

            if (
                !cleanUserName ||
                !cleanUserEmail ||
                !cleanPassword
            ) {
                return sendError(
                    res,
                    400,
                    "Name, email and password are required."
                );
            }

            if (
                !isValidEmail(
                    cleanUserEmail
                )
            ) {
                return sendError(
                    res,
                    400,
                    "Please enter a valid email address."
                );
            }

            // ==================================================
            // DUPLICATE EMAIL
            // ==================================================

            const {
                data: existingUser,
                error: existingError
            } = await supabase
                .from("users")
                .select("id")
                .eq(
                    "email",
                    cleanUserEmail
                )
                .maybeSingle();

            if (existingError) {
                throw existingError;
            }

            if (existingUser) {
                return sendError(
                    res,
                    409,
                    "You have already registered please login."
                );
            }

            // ==================================================
            // CREATE USER
            // ==================================================

            const {
                data,
                error
            } = await supabase
                .from("users")
                .insert([
                    {
                        name:
                            cleanUserName,

                        email:
                            cleanUserEmail,

                        phone:
                            cleanPhone,

                        password:
                            cleanPassword
                    }
                ])
                .select(
                    "id, name, email, phone"
                )
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                message:
                    "Registration successful.",
                user: data
            });

        } catch (error) {
            console.error(
                "REGISTER ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to register.",
                error
            );
        }
    }
);

// ==================================================
// LOGIN
// ==================================================

app.post(
    "/login",
    async (req, res) => {
        try {
            const {
                email,
                password
            } = req.body;

            const cleanUserEmail =
                cleanEmail(email);

            const cleanPassword =
                String(password || "");

            if (
                !cleanUserEmail ||
                !cleanPassword
            ) {
                return sendError(
                    res,
                    400,
                    "Email and password are required."
                );
            }

            const {
                data: user,
                error
            } = await supabase
                .from("users")
                .select("*")
                .eq(
                    "email",
                    cleanUserEmail
                )
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!user) {
                return sendError(
                    res,
                    401,
                    "Invalid email or password."
                );
            }

            if (
                String(user.password) !==
                cleanPassword
            ) {
                return sendError(
                    res,
                    401,
                    "Invalid email or password."
                );
            }

            // ==================================================
            // ATTENDANCE
            // ==================================================

            try {
                await markLoginAttendance(
                    user.name,
                    user.email,
                    user.id
                );
            } catch (
                attendanceError
            ) {
                console.error(
                    "LOGIN ATTENDANCE ERROR:",
                    attendanceError
                );
            }

            return res.json({
                success: true,
                message:
                    "Login successful.",

                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone
                }
            });

        } catch (error) {
            console.error(
                "LOGIN ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to login.",
                error
            );
        }
    }
);

// ==================================================
// ATTENDANCE - GENERIC
// ==================================================

app.post(
    "/attendance",
    async (req, res) => {
        try {
            const {
                name,
                email
            } = req.body;

            const {
                cleanUserName,
                cleanUserEmail,
                userId
            } =
                await resolveUserDetails(
                    name,
                    email
                );

            const result =
                await markLoginAttendance(
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

            return sendError(
                res,
                500,
                "Unable to mark attendance.",
                error
            );
        }
    }
);

// ==================================================
// ATTENDANCE ENTER
// ==================================================

app.post(
    "/attendance/enter",
    async (req, res) => {
        try {
            const {
                name,
                email
            } = req.body;

            const cleanUserEmail =
                cleanEmail(email);

            let cleanUserName =
                cleanName(name);

            let userId = null;

            if (!cleanUserEmail) {
                return sendError(
                    res,
                    400,
                    "Email is required."
                );
            }

            const user =
                await findUserByEmail(
                    cleanUserEmail
                );

            if (user) {
                userId = user.id;

                if (!cleanUserName) {
                    cleanUserName =
                        cleanName(
                            user.name
                        );
                }
            }

            if (!cleanUserName) {
                return sendError(
                    res,
                    400,
                    "Name and email are required."
                );
            }

            const {
                start,
                end
            } = getIndiaDateRange();

            const {
                data: existing,
                error: existingError
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanUserEmail
                )
                .gte(
                    "entry_time",
                    start
                )
                .lt(
                    "entry_time",
                    end
                )
                .order("entry_time", {
                    ascending: false
                })
                .limit(1);

            if (existingError) {
                throw existingError;
            }

            if (
                existing &&
                existing.length > 0
            ) {
                return res.json({
                    success: true,
                    alreadyMarked: true,
                    message:
                        "Today's attendance is already marked.",
                    attendance:
                        formatAttendance(
                            existing[0]
                        )
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("attendance")
                .insert([
                    {
                        user_id:
                            userId
                                ? String(
                                      userId
                                  )
                                : cleanUserEmail,

                        name:
                            cleanUserName,

                        email:
                            cleanUserEmail,

                        entry_time:
                            new Date().toISOString(),

                        exit_time:
                            null,

                        status:
                            "Present"
                    }
                ])
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                alreadyMarked: false,
                message:
                    "Attendance marked successfully.",
                attendance:
                    formatAttendance(data)
            });

        } catch (error) {
            console.error(
                "ATTENDANCE ENTER ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to mark attendance.",
                error
            );
        }
    }
);

// ==================================================
// ATTENDANCE EXIT
// ==================================================

app.post(
    "/attendance/exit",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.body.email
                );

            if (!cleanUserEmail) {
                return sendError(
                    res,
                    400,
                    "Email is required."
                );
            }

            const {
                start,
                end
            } = getIndiaDateRange();

            const {
                data: records,
                error
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanUserEmail
                )
                .gte(
                    "entry_time",
                    start
                )
                .lt(
                    "entry_time",
                    end
                )
                .order("entry_time", {
                    ascending: false
                })
                .limit(1);

            if (error) {
                throw error;
            }

            if (
                !records ||
                records.length === 0
            ) {
                return sendError(
                    res,
                    404,
                    "Today's attendance not found."
                );
            }

            const record =
                records[0];

            if (record.exit_time) {
                return res.json({
                    success: true,
                    message:
                        "Exit attendance is already marked.",
                    attendance:
                        formatAttendance(
                            record
                        )
                });
            }

            const {
                data: updated,
                error: updateError
            } = await supabase
                .from("attendance")
                .update({
                    exit_time:
                        new Date().toISOString(),

                    status:
                        "Completed"
                })
                .eq(
                    "id",
                    record.id
                )
                .select()
                .single();

            if (updateError) {
                throw updateError;
            }

            return res.json({
                success: true,
                message:
                    "Exit attendance marked successfully.",
                attendance:
                    formatAttendance(
                        updated
                    )
            });

        } catch (error) {
            console.error(
                "ATTENDANCE EXIT ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to mark exit attendance.",
                error
            );
        }
    }
);

// ==================================================
// ATTENDANCE STATUS
// ==================================================

app.get(
    "/attendance/status",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.query.email
                );

            if (!cleanUserEmail) {
                return sendError(
                    res,
                    400,
                    "Email is required."
                );
            }

            const {
                start,
                end
            } = getIndiaDateRange();

            const {
                data: records,
                error
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanUserEmail
                )
                .gte(
                    "entry_time",
                    start
                )
                .lt(
                    "entry_time",
                    end
                )
                .order("entry_time", {
                    ascending: false
                })
                .limit(1);

            if (error) {
                throw error;
            }

            if (
                !records ||
                records.length === 0
            ) {
                return res.json({
                    success: true,
                    marked: false,
                    attendance: null
                });
            }

            return res.json({
                success: true,
                marked: true,
                attendance:
                    formatAttendance(
                        records[0]
                    )
            });

        } catch (error) {
            console.error(
                "ATTENDANCE STATUS ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to get attendance.",
                error
            );
        }
    }
);

// ==================================================
// GET ATTENDANCE BY EMAIL
// ==================================================

app.get(
    "/attendance/:email",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.params.email
                );

            if (!cleanUserEmail) {
                return sendError(
                    res,
                    400,
                    "Email is required."
                );
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

            return sendError(
                res,
                500,
                "Unable to get attendance.",
                error
            );
        }
    }
);

// ==================================================
// ADMIN ATTENDANCE
// ==================================================

async function getAllAttendance(
    req,
    res
) {
    try {
        const {
            data,
            error
        } = await supabase
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
            attendance:
                (data || [])
                    .map(
                        formatAttendance
                    )
        });

    } catch (error) {
        console.error(
            "ADMIN ATTENDANCE ERROR:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to get attendance.",
            error
        );
    }
}

app.get(
    "/admin/attendance",
    getAllAttendance
);

app.get(
    "/attendance/admin",
    getAllAttendance
);

// ==================================================
// BOOKS - GET ALL
// ==================================================

app.get(
    "/books",
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabase
                .from("books")
                .select("*")
                .order("id", {
                    ascending: false
                });

            if (error) {
                throw error;
            }

            const books =
                Array.isArray(data)
                    ? data
                    : [];

            return res.json({
                success: true,
                books
            });

        } catch (error) {
            console.error(
                "GET BOOKS ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to get books.",
                error
            );
        }
    }
);

// ==================================================
// ADD BOOK
// ==================================================

app.post(
    "/books",
    async (req, res) => {
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
                return sendError(
                    res,
                    400,
                    "Book name is required."
                );
            }

            let cleanYear = null;

            if (
                year !== undefined &&
                year !== null &&
                String(year).trim() !== ""
            ) {
                const parsedYear =
                    Number(year);

                if (
                    !Number.isFinite(
                        parsedYear
                    )
                ) {
                    return sendError(
                        res,
                        400,
                        "Book year must be a valid number."
                    );
                }

                cleanYear =
                    parsedYear;
            }

            let cleanPrice = 0;

            if (
                price !== undefined &&
                price !== null &&
                String(price).trim() !== ""
            ) {
                const parsedPrice =
                    Number(price);

                if (
                    !Number.isFinite(
                        parsedPrice
                    )
                ) {
                    return sendError(
                        res,
                        400,
                        "Book price must be a valid number."
                    );
                }

                cleanPrice =
                    parsedPrice;
            }

            const {
                data,
                error
            } = await supabase
                .from("books")
                .insert([
                    {
                        name:
                            cleanBookName,

                        author:
                            cleanValue(
                                author
                            ),

                        category:
                            cleanValue(
                                category
                            ),

                        year:
                            cleanYear,

                        image:
                            cleanValue(
                                image
                            ),

                        description:
                            cleanValue(
                                description
                            ),

                        rented_by:
                            null,

                        created_by:
                            created_by ||
                            new Date().toISOString(),

                        price:
                            cleanPrice
                    }
                ])
                .select()
                .single();

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                message:
                    "Book added successfully.",
                book: data
            });

        } catch (error) {
            console.error(
                "ADD BOOK ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to add book.",
                error
            );
        }
    }
);

// ==================================================
// DELETE BOOK
// ==================================================

app.delete(
    "/books/:id",
    async (req, res) => {
        try {
            const bookId =
                req.params.id;

            const {
                data: book,
                error: bookError
            } = await supabase
                .from("books")
                .select("*")
                .eq("id", bookId)
                .maybeSingle();

            if (bookError) {
                throw bookError;
            }

            if (!book) {
                return sendError(
                    res,
                    404,
                    "Book not found."
                );
            }

            if (
                cleanRentedBy(
                    book.rented_by
                )
            ) {
                return sendError(
                    res,
                    400,
                    "You cannot delete a rented book."
                );
            }

            const {
                error
            } = await supabase
                .from("books")
                .delete()
                .eq("id", bookId);

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                message:
                    "Book deleted successfully."
            });

        } catch (error) {
            console.error(
                "DELETE BOOK ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to delete book.",
                error
            );
        }
    }
);

// ==================================================
// RENT BOOK
// ==================================================

app.post(
    "/rent",
    async (req, res) => {
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
                return sendError(
                    res,
                    400,
                    "Name, email and book name are required."
                );
            }

            if (
                !isValidEmail(
                    cleanUserEmail
                )
            ) {
                return sendError(
                    res,
                    400,
                    "Please enter a valid email address."
                );
            }

            // ==================================================
            // FIND BOOK
            // ==================================================

            const {
                data: book,
                error: bookError
            } = await supabase
                .from("books")
                .select("*")
                .eq(
                    "name",
                    cleanBookName
                )
                .maybeSingle();

            if (bookError) {
                throw bookError;
            }

            if (!book) {
                return sendError(
                    res,
                    404,
                    "Book not found."
                );
            }

            // ==================================================
            // CHECK AVAILABILITY
            // ==================================================

            if (
                cleanRentedBy(
                    book.rented_by
                )
            ) {
                return sendError(
                    res,
                    400,
                    "This book is already rented."
                );
            }

            // ==================================================
            // CHECK USER ACTIVE RENTAL
            // ==================================================

            const {
                data: existingRental,
                error: rentalError
            } = await supabase
                .from("transactions")
                .select(
                    "id, book_name, status, submit_date"
                )
                .eq(
                    "email",
                    cleanUserEmail
                )
                .eq(
                    "book_name",
                    cleanBookName
                )
                .eq(
                    "status",
                    "RENTED"
                )
                .is(
                    "submit_date",
                    null
                )
                .limit(1);

            if (rentalError) {
                throw rentalError;
            }

            if (
                existingRental &&
                existingRental.length > 0
            ) {
                return sendError(
                    res,
                    400,
                    "You have already rented this book."
                );
            }

            // ==================================================
            // ATOMIC BOOK LOCK
            // ==================================================
            // Only update if rented_by is still NULL.
            // This helps prevent two users from renting
            // the same book at the same time.
            // ==================================================

            const {
                data: lockedBook,
                error: lockError
            } = await supabase
                .from("books")
                .update({
                    rented_by:
                        cleanUserName
                })
                .eq(
                    "id",
                    book.id
                )
                .is(
                    "rented_by",
                    null
                )
                .select()
                .maybeSingle();

            if (lockError) {
                throw lockError;
            }

            if (!lockedBook) {
                return sendError(
                    res,
                    409,
                    "This book was just rented by another user. Please refresh the page."
                );
            }

            // ==================================================
            // CREATE TRANSACTION
            // ==================================================

            const {
                data: transaction,
                error: transactionError
            } = await supabase
                .from("transactions")
                .insert([
                    {
                        name:
                            cleanUserName,

                        book_name:
                            cleanBookName,

                        rent_date:
                            new Date().toISOString(),

                        submit_date:
                            null,

                        status:
                            "RENTED",

                        email:
                            cleanUserEmail,

                        author:
                            cleanAuthor ||
                            cleanValue(
                                book.author
                            )
                    }
                ])
                .select()
                .single();

            if (transactionError) {
                // Roll back book lock.
                await supabase
                    .from("books")
                    .update({
                        rented_by: null
                    })
                    .eq(
                        "id",
                        book.id
                    )
                    .eq(
                        "rented_by",
                        cleanUserName
                    );

                throw transactionError;
            }

            return res.json({
                success: true,
                message:
                    "Book rented successfully.",
                transaction
            });

        } catch (error) {
            console.error(
                "RENT ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to rent book.",
                error
            );
        }
    }
);

// ==================================================
// MY RENTALS
// ==================================================

async function getMyRentals(
    req,
    res
) {
    try {
        const cleanUserEmail =
            cleanEmail(
                req.query.email
            );

        if (!cleanUserEmail) {
            return sendError(
                res,
                400,
                "Email is required."
            );
        }

        const {
            data,
            error
        } = await supabase
            .from("transactions")
            .select("*")
            .eq(
                "email",
                cleanUserEmail
            )
            .eq(
                "status",
                "RENTED"
            )
            .is(
                "submit_date",
                null
            )
            .order(
                "rent_date",
                {
                    ascending: false
                }
            );

        if (error) {
            throw error;
        }

        const rentals =
            Array.isArray(data)
                ? data
                : [];

        return res.json({
            success: true,
            rentals
        });

    } catch (error) {
        console.error(
            "MY RENTALS ERROR:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to get rentals.",
            error
        );
    }
}

app.get(
    "/rentals",
    getMyRentals
);

app.get(
    "/my-rentals",
    getMyRentals
);

// ==================================================
// SUBMIT / RETURN BOOK
// ==================================================

app.post(
    "/submit",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.body.email
                );

            const cleanBookName =
                cleanValue(
                    req.body.book_name
                );

            if (
                !cleanUserEmail ||
                !cleanBookName
            ) {
                return sendError(
                    res,
                    400,
                    "Email and book name are required."
                );
            }

            // ==================================================
            // FIND ACTIVE TRANSACTION
            // ==================================================

            const {
                data: transactions,
                error
            } = await supabase
                .from("transactions")
                .select("*")
                .eq(
                    "email",
                    cleanUserEmail
                )
                .eq(
                    "book_name",
                    cleanBookName
                )
                .eq(
                    "status",
                    "RENTED"
                )
                .is(
                    "submit_date",
                    null
                )
                .order(
                    "rent_date",
                    {
                        ascending: false
                    }
                )
                .limit(1);

            if (error) {
                throw error;
            }

            if (
                !transactions ||
                transactions.length === 0
            ) {
                return sendError(
                    res,
                    404,
                    "No active rental found for this book."
                );
            }

            const transaction =
                transactions[0];

            // ==================================================
            // FIND BOOK FIRST
            // ==================================================

            const {
                data: book,
                error: bookError
            } = await supabase
                .from("books")
                .select(
                    "id, name, rented_by"
                )
                .eq(
                    "name",
                    cleanBookName
                )
                .maybeSingle();

            if (bookError) {
                throw bookError;
            }

            // ==================================================
            // UPDATE TRANSACTION
            // ==================================================

            const submitDate =
                new Date().toISOString();

            const {
                data: updatedTransaction,
                error: updateError
            } = await supabase
                .from("transactions")
                .update({
                    status:
                        "SUBMITTED",

                    submit_date:
                        submitDate
                })
                .eq(
                    "id",
                    transaction.id
                )
                .select()
                .single();

            if (updateError) {
                throw updateError;
            }

            // ==================================================
            // RELEASE BOOK
            // ==================================================

            if (book) {
                const currentRenter =
                    normalizeName(
                        cleanRentedBy(
                            book.rented_by
                        )
                    );

                const transactionRenter =
                    normalizeName(
                        transaction.name
                    );

                if (
                    currentRenter ===
                    transactionRenter
                ) {
                    const {
                        error: clearError
                    } = await supabase
                        .from("books")
                        .update({
                            rented_by: null
                        })
                        .eq(
                            "id",
                            book.id
                        )
                        .eq(
                            "rented_by",
                            book.rented_by
                        );

                    if (clearError) {
                        // Try to restore transaction
                        // if releasing book fails.
                        await supabase
                            .from(
                                "transactions"
                            )
                            .update({
                                status:
                                    "RENTED",

                                submit_date:
                                    null
                            })
                            .eq(
                                "id",
                                transaction.id
                            );

                        throw clearError;
                    }
                }
            }

            return res.json({
                success: true,
                message:
                    "Book submitted successfully.",
                transaction:
                    updatedTransaction
            });

        } catch (error) {
            console.error(
                "SUBMIT ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to submit book.",
                error
            );
        }
    }
);

// ==================================================
// ALL TRANSACTIONS
// ==================================================

app.get(
    "/transactions",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.query.email
                );

            let query =
                supabase
                    .from(
                        "transactions"
                    )
                    .select("*")
                    .order(
                        "rent_date",
                        {
                            ascending: false
                        }
                    );

            if (cleanUserEmail) {
                query =
                    query.eq(
                        "email",
                        cleanUserEmail
                    );
            }

            const {
                data,
                error
            } = await query;

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                transactions:
                    Array.isArray(data)
                        ? data
                        : []
            });

        } catch (error) {
            console.error(
                "TRANSACTIONS ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to get transactions.",
                error
            );
        }
    }
);

// ==================================================
// ACCOUNT DELETE
// ==================================================

app.delete(
    "/account",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.body.email
                );

            if (!cleanUserEmail) {
                return sendError(
                    res,
                    400,
                    "Email is required."
                );
            }

            // ==================================================
            // FIND USER
            // ==================================================

            const user =
                await findUserByEmail(
                    cleanUserEmail
                );

            if (!user) {
                return sendError(
                    res,
                    404,
                    "User account not found."
                );
            }

            // ==================================================
            // CHECK ACTIVE RENTALS
            // ==================================================

            const rentalInfo =
                await getActiveRentalInfo(
                    cleanUserEmail,
                    user.name
                );

            if (
                rentalInfo.actualActive &&
                rentalInfo.actualActive.length >
                    0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "You cannot delete your account while you have a rented book. Please submit the book first.",

                    rentals:
                        rentalInfo.actualActive.map(
                            item => ({
                                book_name:
                                    item
                                        .transaction
                                        .book_name,

                                rent_date:
                                    item
                                        .transaction
                                        .rent_date
                            })
                        )
                });
            }

            // ==================================================
            // DELETE STALE TRANSACTIONS
            // ==================================================

            for (
                const transaction
                of rentalInfo.staleTransactions ||
                []
            ) {
                const {
                    error
                } = await supabase
                    .from(
                        "transactions"
                    )
                    .delete()
                    .eq(
                        "id",
                        transaction.id
                    );

                if (error) {
                    throw error;
                }
            }

            // ==================================================
            // DELETE ATTENDANCE
            // ==================================================

            const {
                error: attendanceError
            } = await supabase
                .from("attendance")
                .delete()
                .eq(
                    "email",
                    cleanUserEmail
                );

            if (attendanceError) {
                throw attendanceError;
            }

            // ==================================================
            // DELETE TRANSACTIONS
            // ==================================================

            const {
                error: transactionError
            } = await supabase
                .from("transactions")
                .delete()
                .eq(
                    "email",
                    cleanUserEmail
                );

            if (transactionError) {
                throw transactionError;
            }

            // ==================================================
            // DELETE USER
            // ==================================================

            const {
                error: userDeleteError
            } = await supabase
                .from("users")
                .delete()
                .eq(
                    "id",
                    user.id
                );

            if (userDeleteError) {
                throw userDeleteError;
            }

            return res.json({
                success: true,
                message:
                    "Account deleted successfully."
            });

        } catch (error) {
            console.error(
                "ACCOUNT DELETE ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to delete account.",
                error
            );
        }
    }
);

// ==================================================
// ADMIN LOGIN
// ==================================================

app.post("/admin/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        // ADMIN LOGIN CREDENTIALS
        const ADMIN_USERNAME = "admin";
        const ADMIN_PASSWORD = "123456";

        console.log("ADMIN LOGIN ATTEMPT");
        console.log("Username received:", username);

        if (
            username !== ADMIN_USERNAME ||
            password !== ADMIN_PASSWORD
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
        console.error("ADMIN LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to login as admin."
        });
    }
});
// ==================================================
// ADMIN USERS
// ==================================================

app.get(
    "/admin/users",
    async (req, res) => {
        try {
            const {
                data,
                error
            } = await supabase
                .from("users")
                .select(
                    "id, name, email, phone"
                )
                .order(
                    "id",
                    {
                        ascending: false
                    }
                );

            if (error) {
                throw error;
            }

            return res.json({
                success: true,
                users:
                    Array.isArray(data)
                        ? data
                        : []
            });

        } catch (error) {
            console.error(
                "ADMIN USERS ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to get users.",
                error
            );
        }
    }
);

// ==================================================
// ADMIN DELETE USER
// ==================================================

app.delete(
    "/admin/users/:id",
    async (req, res) => {
        try {
            const userId =
                req.params.id;

            // ==================================================
            // FIND USER
            // ==================================================

            const {
                data: user,
                error: userError
            } = await supabase
                .from("users")
                .select("*")
                .eq(
                    "id",
                    userId
                )
                .maybeSingle();

            if (userError) {
                throw userError;
            }

            if (!user) {
                return sendError(
                    res,
                    404,
                    "User not found."
                );
            }

            // ==================================================
            // CHECK ACTIVE RENTALS
            // ==================================================

            const rentalInfo =
                await getActiveRentalInfo(
                    user.email,
                    user.name
                );

            if (
                rentalInfo.actualActive &&
                rentalInfo.actualActive.length >
                    0
            ) {
                return sendError(
                    res,
                    400,
                    "This user has a rented book. Please submit the book first."
                );
            }

            // ==================================================
            // DELETE STALE RENTALS
            // ==================================================

            for (
                const transaction
                of rentalInfo.staleTransactions ||
                []
            ) {
                const {
                    error
                } = await supabase
                    .from(
                        "transactions"
                    )
                    .delete()
                    .eq(
                        "id",
                        transaction.id
                    );

                if (error) {
                    throw error;
                }
            }

            // ==================================================
            // DELETE ATTENDANCE
            // ==================================================

            const {
                error: attendanceError
            } = await supabase
                .from("attendance")
                .delete()
                .eq(
                    "email",
                    user.email
                );

            if (attendanceError) {
                throw attendanceError;
            }

            // ==================================================
            // DELETE TRANSACTIONS
            // ==================================================

            const {
                error: transactionError
            } = await supabase
                .from("transactions")
                .delete()
                .eq(
                    "email",
                    user.email
                );

            if (transactionError) {
                throw transactionError;
            }

            // ==================================================
            // DELETE USER
            // ==================================================

            const {
                error: deleteError
            } = await supabase
                .from("users")
                .delete()
                .eq(
                    "id",
                    userId
                );

            if (deleteError) {
                throw deleteError;
            }

            return res.json({
                success: true,
                message:
                    "User deleted successfully."
            });

        } catch (error) {
            console.error(
                "ADMIN DELETE USER ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to delete user.",
                error
            );
        }
    }
);

// ==================================================
// OTP STORE
// ==================================================

const otpStore = new Map();

// ==================================================
// SEND EMAIL OTP
// ==================================================

app.post(
    "/send-email-otp",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.body.email
                );

            if (!cleanUserEmail) {
                return sendError(
                    res,
                    400,
                    "Email is required."
                );
            }

            if (
                !isValidEmail(
                    cleanUserEmail
                )
            ) {
                return sendError(
                    res,
                    400,
                    "Please enter a valid email address."
                );
            }

            if (!resend) {
                return sendError(
                    res,
                    500,
                    "Email service is not configured."
                );
            }

            // ==================================================
            // CHECK EXISTING USER
            // ==================================================

            const existingUser =
                await findUserByEmail(
                    cleanUserEmail
                );

            if (existingUser) {
                return sendError(
                    res,
                    409,
                    "You have already registered please login."
                );
            }

            // ==================================================
            // GENERATE OTP
            // ==================================================

            const otp =
                crypto
                    .randomInt(
                        100000,
                        1000000
                    )
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

            // ==================================================
            // SEND OTP
            // ==================================================

            const {
                error: resendError
            } = await resend.emails.send({
                from:
                    RESEND_FROM_EMAIL,

                to: [
                    cleanUserEmail
                ],

                subject:
                    "Atal Library - Email Verification OTP",

                html: `
                    <!DOCTYPE html>

                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>Atal Library OTP</title>
                    </head>

                    <body style="
                        margin:0;
                        padding:0;
                        background:#f4f6f8;
                        font-family:Arial,sans-serif;
                    ">

                        <div style="
                            max-width:600px;
                            margin:30px auto;
                            background:white;
                            padding:30px;
                            border-radius:12px;
                            box-shadow:0 4px 20px rgba(0,0,0,0.08);
                        ">

                            <h2 style="
                                margin-top:0;
                                color:#222;
                            ">
                                Atal Library
                            </h2>

                            <p>
                                Your email verification OTP is:
                            </p>

                            <div style="
                                font-size:32px;
                                font-weight:bold;
                                letter-spacing:8px;
                                padding:20px;
                                background:#f1f3f5;
                                text-align:center;
                                border-radius:10px;
                                margin:20px 0;
                            ">
                                ${otp}
                            </div>

                            <p>
                                This OTP will expire in
                                <strong>10 minutes</strong>.
                            </p>

                            <p style="
                                color:#666;
                                font-size:14px;
                            ">
                                If you did not request this OTP,
                                you can safely ignore this email.
                            </p>

                        </div>

                    </body>
                    </html>
                `
            });

            if (resendError) {
                console.error(
                    "RESEND ERROR:",
                    resendError
                );

                otpStore.delete(
                    cleanUserEmail
                );

                return sendError(
                    res,
                    500,
                    "Unable to send OTP.",
                    resendError
                );
            }

            return res.json({
                success: true,
                message:
                    "OTP sent successfully."
            });

        } catch (error) {
            console.error(
                "SEND OTP ERROR:",
                error
            );

            return sendError(
                res,
                500,
                "Unable to send OTP.",
                error
            );
        }
    }
);

// ==================================================
// VERIFY EMAIL OTP
// ==================================================

app.post(
    "/verify-email-otp",
    async (req, res) => {
        try {
            const cleanUserEmail =
                cleanEmail(
                    req.body.email
                );

            const cleanOtp =
                String(
                    req.body.otp || ""
                ).trim();

            if (
                !cleanUserEmail ||
                !cleanOtp
            ) {
                return sendError(
                    res,
                    400,
                    "Email and OTP are required."
                );
            }

            const stored =
                otpStore.get(
                    cleanUserEmail
                );

            if (!stored) {
                return sendError(
                    res,
                    400,
                    "OTP not found or expired."
                );
            }

            if (
                Date.now() >
                stored.expiresAt
            ) {
                otpStore.delete(
                    cleanUserEmail
                );

                return sendError(
                    res,
                    400,
                    "OTP has expired."
                );
            }

            if (
                stored.otp !==
                cleanOtp
            ) {
                return sendError(
                    res,
                    400,
                    "Invalid OTP."
                );
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

            return sendError(
                res,
                500,
                "Unable to verify OTP.",
                error
            );
        }
    }
);

// ==================================================
// CLEAN EXPIRED OTPs
// ==================================================

setInterval(
    () => {
        const now =
            Date.now();

        for (
            const [
                email,
                data
            ]
            of otpStore.entries()
        ) {
            if (
                now >
                data.expiresAt
            ) {
                otpStore.delete(
                    email
                );
            }
        }
    },
    60 * 1000
);

// ==================================================
// 404 ROUTE
// ==================================================

app.use(
    (req, res) => {
        return res.status(404).json({
            success: false,
            message:
                `API route not found: ${req.method} ${req.originalUrl}`
        });
    }
);

// ==================================================
// GLOBAL ERROR HANDLER
// ==================================================

app.use(
    (err, req, res, next) => {
        console.error(
            "GLOBAL SERVER ERROR:",
            err
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        return res.status(500).json({
            success: false,
            message:
                "Internal server error.",
            error:
                err.message
        });
    }
);

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

        console.log(
            `Health check: http://localhost:${PORT}/health`
        );
    }
);