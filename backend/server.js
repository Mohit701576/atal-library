require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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

const PORT = process.env.PORT || 3000;

// ==================================================
// EMAIL TRANSPORTER
// ==================================================

const emailTransporter = nodemailer.createTransport({

    service: "gmail",

    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }

});

// ==================================================
// GENERATE OTP
// ==================================================

function generateOTP() {

    return Math.floor(
        100000 + Math.random() * 900000
    ).toString();

}

// ==================================================
// ADMIN LOGIN
// ==================================================

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

let adminToken = null;

// ==================================================
// EMAIL OTP STORAGE
// ==================================================

let emailOtps = {};

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "..")
    )
);

// ==================================================
// ADMIN LOGIN API
// ==================================================

app.post(
    "/admin-login",
    (req, res) => {

        const {
            username,
            password
        } = req.body;

        if (
            username !== ADMIN_USERNAME ||
            password !== ADMIN_PASSWORD
        ) {

            return res.status(401).json({

                message:
                    "Invalid admin username or password."

            });

        }

        adminToken =
            crypto
                .randomBytes(32)
                .toString("hex");

        res.json({

            message:
                "Admin login successful.",

            token:
                adminToken

        });

    }
);

// ==================================================
// ADMIN AUTHENTICATION
// ==================================================

function checkAdmin(
    req,
    res,
    next
) {

    const authHeader =
        req.headers.authorization || "";

    const token =
        authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : "";

    if (
        !adminToken ||
        token !== adminToken
    ) {

        return res.status(401).json({

            message:
                "Admin login required."

        });

    }

    next();

}

// ==================================================
// USER REGISTER
// ==================================================

app.post(
    "/register",
    async (req, res) => {

        try {

            console.log("REGISTER API CALLED");
            console.log("Register data:", req.body);

            const {
                name,
                email,
                phone,
                password
            } = req.body;

            // ==================================================
            // REQUIRED FIELDS
            // ==================================================

            if (
                !name ||
                !email ||
                !phone ||
                !password
            ) {

                return res.status(400).json({

                    message:
                        "Name, email, phone and password are required."

                });

            }

            // ==================================================
            // CLEAN DATA
            // ==================================================

            const cleanName =
                name
                    .toString()
                    .trim();

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const cleanPhone =
                phone
                    .toString()
                    .trim();

            // ==================================================
            // CHECK PHONE
            // ==================================================

            if (
                !/^\d{10}$/.test(
                    cleanPhone
                )
            ) {

                return res.status(400).json({

                    message:
                        "Please enter a valid 10-digit phone number."

                });

            }

            // ==================================================
            // CHECK DUPLICATE EMAIL
            // ==================================================

            const {
                data: existingUsers,
                error: userCheckError
            } = await supabase
                .from("users")
                .select("id,email")
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (userCheckError) {

                console.log(
                    "User check error:",
                    userCheckError
                );

                return res.status(500).json({

                    message:
                        "Unable to check user."

                });

            }

            if (
                existingUsers &&
                existingUsers.length > 0
            ) {

                return res.status(400).json({

                    message:
                        "You have already registered. Please login."

                });

            }

            // ==================================================
            // CHECK EMAIL OTP
            // ==================================================

            const verifiedOTP =
                emailOtps[cleanEmail];

            if (
                !verifiedOTP ||
                verifiedOTP.verified !== true
            ) {

                return res.status(400).json({

                    message:
                        "Please verify your email before registering."

                });

            }

            // ==================================================
            // INSERT USER
            // ==================================================

            const {
                error: insertError
            } = await supabase
                .from("users")
                .insert({

                    name:
                        cleanName,

                    email:
                        cleanEmail,

                    phone:
                        cleanPhone,

                    password:
                        password

                });

            if (insertError) {

                console.log(
                    "Register error:",
                    insertError
                );

                return res.status(500).json({

                    message:
                        "Unable to register user."

                });

            }

            // ==================================================
            // DELETE OTP
            // ==================================================

            delete emailOtps[cleanEmail];

            res.json({

                message:
                    "User registered successfully."

            });

        }

        catch (error) {

            console.log(
                "Register server error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// SEND EMAIL OTP
// ==================================================

app.post(
    "/send-email-otp",
    async (req, res) => {

        try {

            const {
                email
            } = req.body;

            if (!email) {

                return res.status(400).json({

                    message:
                        "Email is required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            // ==================================================
            // CHECK EMAIL
            // ==================================================

            const {
                data: existingUsers,
                error
            } = await supabase
                .from("users")
                .select("id")
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (error) {

                console.log(
                    "Email check error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to check email."

                });

            }

            if (
                existingUsers &&
                existingUsers.length > 0
            ) {

                return res.status(400).json({

                    message:
                        "Email already registered. Please login."

                });

            }

            // ==================================================
            // GENERATE OTP
            // ==================================================

            const otp =
                generateOTP();

            // ==================================================
            // SAVE OTP
            // ==================================================

            emailOtps[cleanEmail] = {

                otp:
                    otp,

                expiresAt:
                    Date.now() +
                    5 * 60 * 1000

            };

            // ==================================================
            // SEND EMAIL
            // ==================================================

            await emailTransporter.sendMail({

                from:
                    process.env.GMAIL_USER,

                to:
                    cleanEmail,

                subject:
                    "Atal Library - Email Verification OTP",

                text:
                    "Your Atal Library verification OTP is " +
                    otp +
                    ". It is valid for 5 minutes."

            });

            console.log(
                "Email OTP sent to:",
                cleanEmail
            );

            res.json({

                message:
                    "OTP sent to your email."

            });

        }

        catch (error) {

            console.log(
                "Email OTP error:",
                error.message
            );

            res.status(500).json({

                message:
                    "Unable to send OTP."

            });

        }

    }
);

// ==================================================
// VERIFY EMAIL OTP
// ==================================================

app.post(
    "/verify-email-otp",
    (req, res) => {

        const {
            email,
            otp
        } = req.body;

        if (
            !email ||
            !otp
        ) {

            return res.status(400).json({

                message:
                    "Email and OTP are required."

            });

        }

        const cleanEmail =
            email
                .toString()
                .trim()
                .toLowerCase();

        const savedOTP =
            emailOtps[cleanEmail];

        // ==================================================
        // OTP NOT FOUND
        // ==================================================

        if (!savedOTP) {

            return res.status(400).json({

                message:
                    "OTP not found. Please request a new OTP."

            });

        }

        // ==================================================
        // CHECK EXPIRY
        // ==================================================

        if (
            Date.now() >
            savedOTP.expiresAt
        ) {

            delete emailOtps[cleanEmail];

            return res.status(400).json({

                message:
                    "OTP expired. Please request a new OTP."

            });

        }

        // ==================================================
        // CHECK OTP
        // ==================================================

        if (
            otp
                .toString()
                .trim() !==
            savedOTP.otp
        ) {

            return res.status(400).json({

                message:
                    "Invalid OTP."

            });

        }

        // ==================================================
        // VERIFIED
        // ==================================================

        emailOtps[cleanEmail].verified =
            true;

        res.json({

            message:
                "Email verified successfully."

        });

    }
);

// ==================================================
// USER LOGIN
// ==================================================

app.post(
    "/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;

            if (
                !email ||
                !password
            ) {

                return res.status(400).json({

                    message:
                        "Email and password are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            // ==================================================
            // FIND USER
            // ==================================================

            const {
                data: users,
                error
            } = await supabase
                .from("users")
                .select("*")
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (error) {

                console.log(
                    "Login error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to login."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "User not found. Please register."

                });

            }

            const user =
                users[0];

            // ==================================================
            // CHECK PASSWORD
            // ==================================================

            if (
                user.password !==
                password
            ) {

                return res.status(401).json({

                    message:
                        "Incorrect email or password."

                });

            }

            res.json({

                message:
                    "Login successful.",

                user: {

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    phone:
                        user.phone || ""

                }

            });

        }

        catch (error) {

            console.log(
                "Login server error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// FORGOT PASSWORD
// ==================================================

app.post(
    "/forgot-password",
    async (req, res) => {

        try {

            const {
                email,
                phone,
                newPassword
            } = req.body;

            if (
                !email ||
                !phone ||
                !newPassword
            ) {

                return res.status(400).json({

                    message:
                        "Email, phone number and new password are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const cleanPhone =
                phone
                    .toString()
                    .trim();

            if (
                !/^\d{10}$/.test(
                    cleanPhone
                )
            ) {

                return res.status(400).json({

                    message:
                        "Please enter a valid 10-digit phone number."

                });

            }

            // ==================================================
            // FIND USER
            // ==================================================

            const {
                data: users,
                error
            } = await supabase
                .from("users")
                .select("id,email,phone")
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "phone",
                    cleanPhone
                )
                .limit(1);

            if (error) {

                console.log(
                    "Forgot password error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to change password."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Email and phone number do not match."

                });

            }

            // ==================================================
            // UPDATE PASSWORD
            // ==================================================

            const userId =
                users[0].id;

            const {
                error: updateError
            } = await supabase
                .from("users")
                .update({

                    password:
                        newPassword

                })
                .eq(
                    "id",
                    userId
                );

            if (updateError) {

                console.log(
                    "Password update error:",
                    updateError
                );

                return res.status(500).json({

                    message:
                        "Unable to change password."

                });

            }

            res.json({

                message:
                    "Password changed successfully."

            });

        }

        catch (error) {

            console.log(
                "Forgot password server error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// GET USERS
// ==================================================

app.get(
    "/users",
    async (req, res) => {

        try {

            const {
                data: users,
                error
            } = await supabase
                .from("users")
                .select("name,email,phone")
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

            if (error) {

                console.log(
                    "Get users error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get users."

                });

            }

            const safeUsers =
                (users || []).map(
                    function (user) {

                        return {

                            Name:
                                user.name || "",

                            Email:
                                user.email || "",

                            Phone:
                                user.phone || ""

                        };

                    }
                );

            res.json(
                safeUsers
            );

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

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
                book,
                author,
                bookId
            } = req.body;

            if (
                !name ||
                !email ||
                !book ||
                !author ||
                !bookId
            ) {

                return res.status(400).json({

                    message:
                        "Book and user information are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            // ==================================================
            // FIND BOOK
            // ==================================================

            const {
                data: books,
                error: bookError
            } = await supabase
                .from("books")
                .select("*")
                .eq(
                    "id",
                    Number(bookId)
                )
                .limit(1);

            if (bookError) {

                console.log(
                    "Book search error:",
                    bookError
                );

                return res.status(500).json({

                    message:
                        "Unable to find book."

                });

            }

            if (
                !books ||
                books.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Book not found."

                });

            }

            const currentBook =
                books[0];

            // ==================================================
            // CHECK ALREADY RENTED
            // ==================================================

            if (
                currentBook.rented_by
            ) {

                return res.status(400).json({

                    message:
                        "This book is already rented."

                });

            }

            // ==================================================
            // UPDATE BOOK
            // ==================================================

            const {
                error: updateBookError
            } = await supabase
                .from("books")
                .update({

                    rented_by:
                        name

                })
                .eq(
                    "id",
                    Number(bookId)
                );

            if (updateBookError) {

                console.log(
                    "Book rent update error:",
                    updateBookError
                );

                return res.status(500).json({

                    message:
                        "Unable to rent book."

                });

            }

            // ==================================================
            // CREATE NEW TRANSACTION
            // ==================================================

            const rentDate =
                new Date().toISOString();

            const {
                error: transactionError
            } = await supabase
                .from("transactions")
   .insert({
    name: name,
    email: cleanEmail,
    book_name: book,
    author: author,
    rent_date: rentDate,
    submit_date: null,
    status: "RENTED"
});
            // ==================================================
            // ROLLBACK BOOK IF TRANSACTION FAILED
            // ==================================================

            if (transactionError) {

                console.log(
                    "Transaction error:",
                    transactionError
                );

                await supabase
                    .from("books")
                    .update({

                        rented_by:
                            ""

                    })
                    .eq(
                        "id",
                        Number(bookId)
                    );

                return res.status(500).json({

                    message:
                        "Book rented but transaction could not be saved."

                });

            }

            res.json({

                message:
                    "Book rented successfully."

            });

        }

        catch (error) {

            console.log(
                "Rent server error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// SUBMIT BOOK
// ==================================================

app.post(
    "/submit",
    async (req, res) => {

        try {

            const {
                name,
                email,
                book,
                author,
                bookId
            } = req.body;

            if (
                !name ||
                !email ||
                !book ||
                !author ||
                !bookId
            ) {

                return res.status(400).json({

                    message:
                        "Book and user information are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            // ==================================================
            // FIND BOOK
            // ==================================================

            const {
                data: books,
                error: bookError
            } = await supabase
                .from("books")
                .select("*")
                .eq(
                    "id",
                    Number(bookId)
                )
                .limit(1);

            if (bookError) {

                console.log(
                    "Book search error:",
                    bookError
                );

                return res.status(500).json({

                    message:
                        "Unable to find book."

                });

            }

            if (
                !books ||
                books.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Book not found."

                });

            }

            const currentBook =
                books[0];

            // ==================================================
            // CHECK BOOK RENTED
            // ==================================================

            if (
                !currentBook.rented_by
            ) {

                return res.status(400).json({

                    message:
                        "This book is already available."

                });

            }

            // ==================================================
            // CHECK PERSON
            // ==================================================

            if (
                currentBook.rented_by !==
                name
            ) {

                return res.status(403).json({

                    message:
                        "Only the person who rented this book can submit it."

                });

            }

            // ==================================================
            // FIND ACTIVE TRANSACTION
            // ==================================================

            const {
                data: transactions,
                error: transactionFindError
            } = await supabase
                .from("transactions")
                .select("*")
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "book_name",
                    book
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

            if (transactionFindError) {

                console.log(
                    "Transaction find error:",
                    transactionFindError
                );

                return res.status(500).json({

                    message:
                        "Unable to find rental transaction."

                });

            }

            if (
                !transactions ||
                transactions.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Active rental transaction not found."

                });

            }

            const currentTransaction =
                transactions[0];

            // ==================================================
            // UPDATE TRANSACTION
            // ==================================================

            const submitDate =
                new Date().toISOString();

            const {
                error: transactionUpdateError
            } = await supabase
                .from("transactions")
                .update({

                    submit_date:
                        submitDate,

                    status:
                        "SUBMITTED"

                })
                .eq(
                    "id",
                    currentTransaction.id
                );

            if (transactionUpdateError) {

                console.log(
                    "Transaction update error:",
                    transactionUpdateError
                );

                return res.status(500).json({

                    message:
                        "Unable to update transaction."

                });

            }

            // ==================================================
            // MAKE BOOK AVAILABLE
            // ==================================================

            const {
                error: updateBookError
            } = await supabase
                .from("books")
                .update({

                    rented_by:
                        ""

                })
                .eq(
                    "id",
                    Number(bookId)
                );

            // ==================================================
            // ROLLBACK TRANSACTION IF BOOK UPDATE FAILED
            // ==================================================

            if (updateBookError) {

                console.log(
                    "Submit book update error:",
                    updateBookError
                );

                await supabase
                    .from("transactions")
                    .update({

                        submit_date:
                            null,

                        status:
                            "RENTED"

                    })
                    .eq(
                        "id",
                        currentTransaction.id
                    );

                return res.status(500).json({

                    message:
                        "Unable to make book available."

                });

            }

            res.json({

                message:
                    "Book submitted successfully."

            });

        }

        catch (error) {

            console.log(
                "Submit server error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// GET ALL BOOKS
// ==================================================

app.get(
    "/books",
    async (req, res) => {

        try {

            const {
                data: books,
                error
            } = await supabase
                .from("books")
                .select("*")
                .order(
                    "id",
                    {
                        ascending: true
                    }
                );

            if (error) {

                console.log(
                    "Get books error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get books."

                });

            }

            const formattedBooks =
                (books || []).map(
                    function (book) {

                        return {

                            ID:
                                book.id,

                            Name:
                                book.name || "",

                            Author:
                                book.author || "",

                            Category:
                                book.category || "",

                            Year:
                                book.year || "",

                            Image:
                                book.image || "",

                            Description:
                                book.description || "",

                            RentedBy:
                                book.rented_by || ""

                        };

                    }
                );

            res.json(
                formattedBooks
            );

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - GET BOOKS
// ==================================================

app.get(
    "/admin/books",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                data: books,
                error
            } = await supabase
                .from("books")
                .select("*")
                .order(
                    "id",
                    {
                        ascending: true
                    }
                );

            if (error) {

                console.log(
                    "Admin books error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get books."

                });

            }

            const formattedBooks =
                (books || []).map(
                    function (book) {

                        return {

                            ID:
                                book.id,

                            Name:
                                book.name || "",

                            Author:
                                book.author || "",

                            Category:
                                book.category || "",

                            Year:
                                book.year || "",

                            Image:
                                book.image || "",

                            Description:
                                book.description || "",

                            RentedBy:
                                book.rented_by || ""

                        };

                    }
                );

            res.json(
                formattedBooks
            );

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - ADD BOOK
// ==================================================

app.post(
    "/admin/books/add",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                name,
                author,
                category,
                year,
                image,
                description
            } = req.body;

            if (
                !name ||
                !author ||
                !category ||
                !year
            ) {

                return res.status(400).json({

                    message:
                        "Book name, author, category and year are required."

                });

            }

            const {
                data: newBooks,
                error
            } = await supabase
                .from("books")
                .insert({

                    name:
                        name,

                    author:
                        author,

                    category:
                        category,

                    year:
                        Number(year),

                    image:
                        image || "",

                    description:
                        description || "",

                    rented_by:
                        ""

                })
                .select()
                .single();

            if (error) {

                console.log(
                    "Add book error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to add book."

                });

            }

            const newBook = {

                ID:
                    newBooks.id,

                Name:
                    newBooks.name,

                Author:
                    newBooks.author,

                Category:
                    newBooks.category,

                Year:
                    newBooks.year,

                Image:
                    newBooks.image,

                Description:
                    newBooks.description,

                RentedBy:
                    newBooks.rented_by || ""

            };

            res.json({

                message:
                    "Book added successfully.",

                book:
                    newBook

            });

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - UPDATE BOOK
// ==================================================

app.put(
    "/admin/books/update/:id",
    checkAdmin,
    async (req, res) => {

        try {

            const bookId =
                Number(
                    req.params.id
                );

            const {
                name,
                author,
                category,
                year,
                image,
                description
            } = req.body;

            const updateData = {};

            if (name) {

                updateData.name =
                    name;

            }

            if (author) {

                updateData.author =
                    author;

            }

            if (category) {

                updateData.category =
                    category;

            }

            if (year) {

                updateData.year =
                    Number(year);

            }

            if (
                image !== undefined
            ) {

                updateData.image =
                    image;

            }

            if (
                description !== undefined
            ) {

                updateData.description =
                    description;

            }

            const {
                data: updatedBooks,
                error
            } = await supabase
                .from("books")
                .update(updateData)
                .eq(
                    "id",
                    bookId
                )
                .select()
                .single();

            if (error) {

                console.log(
                    "Update book error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to update book."

                });

            }

            const updatedBook = {

                ID:
                    updatedBooks.id,

                Name:
                    updatedBooks.name,

                Author:
                    updatedBooks.author,

                Category:
                    updatedBooks.category,

                Year:
                    updatedBooks.year,

                Image:
                    updatedBooks.image,

                Description:
                    updatedBooks.description,

                RentedBy:
                    updatedBooks.rented_by || ""

            };

            res.json({

                message:
                    "Book updated successfully.",

                book:
                    updatedBook

            });

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - DELETE BOOK
// ==================================================

app.delete(
    "/admin/books/delete/:id",
    checkAdmin,
    async (req, res) => {

        try {

            const bookId =
                Number(
                    req.params.id
                );

            // ==================================================
            // CHECK BOOK
            // ==================================================

            const {
                data: books,
                error: findError
            } = await supabase
                .from("books")
                .select("id,rented_by")
                .eq(
                    "id",
                    bookId
                )
                .limit(1);

            if (findError) {

                return res.status(500).json({

                    message:
                        "Unable to find book."

                });

            }

            if (
                !books ||
                books.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Book not found."

                });

            }

            if (
                books[0].rented_by
            ) {

                return res.status(400).json({

                    message:
                        "This book is currently issued. Submit the book before deleting it."

                });

            }

            // ==================================================
            // DELETE BOOK
            // ==================================================

            const {
                error: deleteError
            } = await supabase
                .from("books")
                .delete()
                .eq(
                    "id",
                    bookId
                );

            if (deleteError) {

                console.log(
                    "Delete book error:",
                    deleteError
                );

                return res.status(500).json({

                    message:
                        "Unable to delete book."

                });

            }

            res.json({

                message:
                    "Book deleted successfully."

            });

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - GET USERS
// ==================================================

app.get(
    "/admin/users",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                data: users,
                error
            } = await supabase
                .from("users")
                .select("name,email,phone")
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

            if (error) {

                console.log(
                    "Admin users error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get users."

                });

            }

            const safeUsers =
                (users || []).map(
                    function (user) {

                        return {

                            Name:
                                user.name || "",

                            Email:
                                user.email || "",

                            Phone:
                                user.phone || ""

                        };

                    }
                );

            res.json(
                safeUsers
            );

        }

        catch (error) {

            console.log(error);

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - GET TRANSACTIONS
// ==================================================

app.get(
    "/admin/transactions",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                data: transactions,
                error
            } = await supabase
                .from("transactions")
                .select(`
    id,
    name,
    email,
    book_name,
    author,
    rent_date,
    submit_date,
    status
`)
                .order(
                    "id",
                    {
                        ascending: false
                    }
                );

            if (error) {

                console.log(
                    "Transactions error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get transactions."

                });

            }

            const result =
                (transactions || []).map(
                    function (transaction) {

                        return {
    ID: transaction.id,

    User: transaction.name || "",

    Email: transaction.email || "",

    Book: transaction.book_name || "",

    Author: transaction.author || "",

    Date: transaction.rent_date || "",

    RentDate: transaction.rent_date || "",

    SubmitDate: transaction.submit_date || "",

    Action: transaction.status || "",

    Status: transaction.status || ""
};

                    }
                );

            res.json(
                result
            );

        }

        catch (error) {

            console.log(
                "Transaction server error:",
                error
            );

            res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// TEST SUPABASE
// ==================================================

app.get(
    "/test-supabase",
    async (req, res) => {

        try {

            const {
                data,
                error
            } = await supabase
                .from("users")
                .select("*")
                .limit(1);

            if (error) {

                console.log(
                    "Supabase Error:",
                    error
                );

                return res.status(500).json({

                    success:
                        false,

                    error:
                        error.message

                });

            }

            res.json({

                success:
                    true,

                message:
                    "Supabase connected successfully!",

                data:
                    data

            });

        }

        catch (error) {

            console.log(
                "Test Supabase error:",
                error
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

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
    }
);