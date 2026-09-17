const nodemailer = require("nodemailer");
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

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
// PROFILE PHOTO UPLOAD
// ==================================================

const PROFILE_PHOTOS_BUCKET = "profile-photos";

const upload = multer({

    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (allowedTypes.includes(file.mimetype)) {

            cb(null, true);

        } else {

            cb(
                new Error(
                    "Only JPG, PNG, WEBP and GIF images are allowed."
                )
            );

        }

    }

});

// ==================================================
// PROFILE PHOTO MIDDLEWARE
// ==================================================

function uploadProfilePhoto(req, res, next) {

    upload.single("profile_photo")(
        req,
        res,
        function (err) {

            if (err instanceof multer.MulterError) {

                if (err.code === "LIMIT_FILE_SIZE") {

                    return res.status(400).json({

                        success: false,

                        message:
                            "Profile photo must be 5 MB or smaller."

                    });

                }

                return res.status(400).json({

                    success: false,

                    message: err.message

                });

            }

            if (err) {

                return res.status(400).json({

                    success: false,

                    message: err.message

                });

            }

            next();

        }
    );

}

// ==================================================
// GET PHOTO EXTENSION
// ==================================================

function getPhotoExtension(mimetype) {

    if (mimetype === "image/png") {
        return "png";
    }

    if (mimetype === "image/webp") {
        return "webp";
    }

    if (mimetype === "image/gif") {
        return "gif";
    }

    return "jpg";

}

// ==================================================
// UPLOAD PHOTO TO SUPABASE
// ==================================================

async function saveProfilePhoto(
    userId,
    file
) {

    const extension =
        getPhotoExtension(file.mimetype);

    const filePath =
        `users/${userId}/profile.${extension}`;

    const {
        error: uploadError
    } = await supabase
        .storage
        .from(PROFILE_PHOTOS_BUCKET)
        .upload(
            filePath,
            file.buffer,
            {
                contentType: file.mimetype,
                upsert: true
            }
        );

    if (uploadError) {

        throw uploadError;

    }

    const {
        data: publicUrlData
    } = supabase
        .storage
        .from(PROFILE_PHOTOS_BUCKET)
        .getPublicUrl(filePath);

    if (
        !publicUrlData ||
        !publicUrlData.publicUrl
    ) {

        throw new Error(
            "Unable to create profile photo URL."
        );

    }

    return (
        publicUrlData.publicUrl +
        "?v=" +
        Date.now()
    );

}

// ==================================================
// DELETE OLD PROFILE PHOTOS
// ==================================================

async function deleteOldProfilePhotos(
    userId,
    currentFilePath
) {

    const possibleFiles = [

        `users/${userId}/profile.jpg`,

        `users/${userId}/profile.png`,

        `users/${userId}/profile.webp`,

        `users/${userId}/profile.gif`

    ];

    const filesToDelete =
        possibleFiles.filter(
            function (filePath) {

                return filePath !== currentFilePath;

            }
        );

    try {

        await supabase
            .storage
            .from(PROFILE_PHOTOS_BUCKET)
            .remove(filesToDelete);

    }

    catch (error) {

        console.log(
            "Old profile photo delete warning:",
            error
        );

    }

}

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
// GMAIL SMTP
// ==================================================

const transporter = nodemailer.createTransport({

    service: "gmail",

    auth: {

        user:
            process.env.GMAIL_USER,

        pass:
            process.env.GMAIL_APP_PASSWORD

    }

});

// ==================================================
// VERIFY GMAIL SMTP CONNECTION
// ==================================================

transporter.verify(
    function (error, success) {

        if (error) {

            console.log(
                "===================================="
            );

            console.log(
                "GMAIL SMTP CONNECTION ERROR"
            );

            console.log(
                "===================================="
            );

            console.log(error);

        } else {

            console.log(
                "===================================="
            );

            console.log(
                "GMAIL SMTP READY"
            );

            console.log(
                "===================================="
            );

        }

    }
);

// ==================================================
// GENERATE OTP
// ==================================================

function generateOTP() {

    return Math.floor(
        100000 +
        Math.random() * 900000
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
// ADMIN LOGIN API
// ==================================================

app.post(
    "/admin-login",
    (req, res) => {

        try {

            const {
                username,
                password
            } = req.body;

            console.log(
                "ADMIN LOGIN API CALLED"
            );

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

            return res.json({

                success: true,

                message:
                    "Admin login successful.",

                token:
                    adminToken

            });

        }

        catch (error) {

            console.log(
                "Admin login error:",
                error
            );

            return res.status(500).json({

                message:
                    "Server error."

            });

        }

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
// SEND EMAIL OTP - GMAIL SMTP
// ==================================================

app.post(
    "/send-email-otp",
    async (req, res) => {

        try {

            console.log(
                "SEND OTP API CALLED"
            );

            const {
                email
            } = req.body;

            // ------------------------------------------
            // EMAIL REQUIRED
            // ------------------------------------------

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }

            // ------------------------------------------
            // CLEAN EMAIL
            // ------------------------------------------

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            console.log(
                "OTP requested for:",
                cleanEmail
            );

            // ------------------------------------------
            // CHECK GMAIL CONFIGURATION
            // ------------------------------------------

            if (
                !process.env.GMAIL_USER ||
                !process.env.GMAIL_APP_PASSWORD
            ) {

                console.log(
                    "GMAIL_USER or GMAIL_APP_PASSWORD is missing."
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Email service is not configured on server."

                });

            }

            // ------------------------------------------
            // CHECK DUPLICATE EMAIL
            // ------------------------------------------

            const {
                data: existingUsers,
                error: userCheckError
            } = await supabase
                .from("users")
                .select("id")
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (userCheckError) {

                console.log(
                    "Email check error:",
                    userCheckError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to check email."

                });

            }

            if (
                existingUsers &&
                existingUsers.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email already registered. Please login."

                });

            }

            // ------------------------------------------
            // GENERATE OTP
            // ------------------------------------------

            const otp =
                generateOTP();

            // ------------------------------------------
            // SAVE OTP
            // ------------------------------------------

            emailOtps[cleanEmail] = {

                otp:
                    otp,

                expiresAt:
                    Date.now() +
                    5 * 60 * 1000,

                verified:
                    false

            };

            // ------------------------------------------
            // EMAIL OPTIONS
            // ------------------------------------------

            const mailOptions = {

                from:
                    `"Atal Library" <${process.env.GMAIL_USER}>`,

                to:
                    cleanEmail,

                subject:
                    "Atal Library - Email Verification OTP",

                text:
                    `Your Atal Library verification OTP is ${otp}.

This OTP is valid for 5 minutes.

Please do not share this OTP with anyone.

If you did not request this OTP, please ignore this email.`,

                html:
                    `
                    <!DOCTYPE html>

                    <html>

                    <head>

                        <meta charset="UTF-8">

                        <title>
                            Atal Library OTP
                        </title>

                    </head>

                    <body
                        style="
                            margin:0;
                            padding:0;
                            background:#f4f6f8;
                            font-family:Arial, sans-serif;
                        "
                    >

                        <div
                            style="
                                max-width:600px;
                                margin:40px auto;
                                background:#ffffff;
                                border-radius:12px;
                                padding:30px;
                                box-shadow:0 4px 15px rgba(0,0,0,0.08);
                            "
                        >

                            <h1
                                style="
                                    text-align:center;
                                    color:#2563eb;
                                    margin-bottom:10px;
                                "
                            >
                                📚 Atal Library
                            </h1>

                            <p
                                style="
                                    text-align:center;
                                    color:#555;
                                    font-size:16px;
                                "
                            >
                                Email Verification
                            </p>

                            <p
                                style="
                                    color:#333;
                                    font-size:15px;
                                    line-height:1.6;
                                "
                            >
                                Hello,
                            </p>

                            <p
                                style="
                                    color:#333;
                                    font-size:15px;
                                    line-height:1.6;
                                "
                            >
                                Your verification OTP for
                                Atal Library is:
                            </p>

                            <div
                                style="
                                    text-align:center;
                                    margin:25px 0;
                                "
                            >

                                <span
                                    style="
                                        display:inline-block;
                                        background:#2563eb;
                                        color:white;
                                        font-size:32px;
                                        font-weight:bold;
                                        letter-spacing:8px;
                                        padding:15px 25px;
                                        border-radius:10px;
                                    "
                                >
                                    ${otp}
                                </span>

                            </div>

                            <p
                                style="
                                    text-align:center;
                                    color:#666;
                                    font-size:14px;
                                "
                            >
                                This OTP is valid for
                                <strong>5 minutes</strong>.
                            </p>

                            <p
                                style="
                                    color:#777;
                                    font-size:13px;
                                    line-height:1.5;
                                    margin-top:25px;
                                "
                            >
                                Please do not share this OTP
                                with anyone.
                            </p>

                            <p
                                style="
                                    color:#777;
                                    font-size:13px;
                                    line-height:1.5;
                                "
                            >
                                If you did not request this OTP,
                                please ignore this email.
                            </p>

                            <hr
                                style="
                                    border:none;
                                    border-top:1px solid #eee;
                                    margin:25px 0;
                                "
                            >

                            <p
                                style="
                                    text-align:center;
                                    color:#999;
                                    font-size:12px;
                                "
                            >
                                © 2026 Atal Library
                            </p>

                        </div>

                    </body>

                    </html>
                    `

            };

            // ------------------------------------------
            // SEND EMAIL
            // ------------------------------------------

            const info =
                await transporter.sendMail(
                    mailOptions
                );

            console.log(
                "OTP email sent successfully."
            );

            console.log(
                "Gmail Message ID:",
                info.messageId
            );

            // ------------------------------------------
            // RESPONSE
            // ------------------------------------------

            return res.json({

                success: true,

                message:
                    "OTP sent to your email."

            });

        }

        catch (error) {

            console.log(
                "================ GMAIL OTP ERROR ================"
            );

            console.log(
                error
            );

            console.log(
                "=================================================="
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send OTP. Please try again."

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

        try {

            const {
                email,
                otp
            } = req.body;

            if (
                !email ||
                !otp
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email and OTP are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const cleanOTP =
                otp
                    .toString()
                    .trim();

            const savedOTP =
                emailOtps[cleanEmail];

            if (!savedOTP) {

                return res.status(400).json({

                    success: false,

                    message:
                        "OTP not found. Please request a new OTP."

                });

            }

            if (
                Date.now() >
                savedOTP.expiresAt
            ) {

                delete emailOtps[cleanEmail];

                return res.status(400).json({

                    success: false,

                    message:
                        "OTP expired. Please request a new OTP."

                });

            }

            if (
                cleanOTP !==
                savedOTP.otp
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid OTP."

                });

            }

            emailOtps[cleanEmail].verified =
                true;

            console.log(
                "Email verified:",
                cleanEmail
            );

            return res.json({

                success: true,

                message:
                    "Email verified successfully."

            });

        }

        catch (error) {

            console.log(
                "OTP verification error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to verify OTP."

            });

        }

    }
);

// ==================================================
// USER REGISTER
// ==================================================

app.post(
    "/register",
    uploadProfilePhoto,
    async (req, res) => {

        try {

            console.log(
                "REGISTER API CALLED"
            );

            const {
                name,
                email,
                phone,
                password
            } = req.body;

            if (
                !name ||
                !email ||
                !phone ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Name, email, phone and password are required."

                });

            }

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please upload a profile photo."

                });

            }

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

            if (
                !/^\d{10}$/.test(
                    cleanPhone
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid 10-digit phone number."

                });

            }

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

                    success: false,

                    message:
                        "Unable to check user."

                });

            }

            if (
                existingUsers &&
                existingUsers.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "You have already registered. Please login."

                });

            }

            const verifiedOTP =
                emailOtps[cleanEmail];

            if (
                !verifiedOTP ||
                verifiedOTP.verified !== true
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please verify your email before registering."

                });

            }

            const {
                data: newUser,
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
                        password,

                    profile_photo:
                        null

                })
                .select(
                    "id,name,email,phone,profile_photo"
                )
                .single();

            if (insertError) {

                console.log(
                    "Register insert error:",
                    insertError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to register user."

                });

            }

            let profilePhotoUrl;

            try {

                profilePhotoUrl =
                    await saveProfilePhoto(
                        newUser.id,
                        req.file
                    );

            }

            catch (photoError) {

                console.log(
                    "Profile photo upload error:",
                    photoError
                );

                await supabase
                    .from("users")
                    .delete()
                    .eq(
                        "id",
                        newUser.id
                    );

                return res.status(500).json({

                    success: false,

                    message:
                        "Profile photo upload failed."

                });

            }

            const {
                error: photoUpdateError
            } = await supabase
                .from("users")
                .update({

                    profile_photo:
                        profilePhotoUrl

                })
                .eq(
                    "id",
                    newUser.id
                );

            if (photoUpdateError) {

                console.log(
                    "Profile photo URL update error:",
                    photoUpdateError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Photo uploaded but could not be saved."

                });

            }

            delete emailOtps[cleanEmail];

            return res.status(201).json({

                success: true,

                message:
                    "User registered successfully.",

                user: {

                    id:
                        newUser.id,

                    name:
                        cleanName,

                    email:
                        cleanEmail,

                    phone:
                        cleanPhone,

                    profile_photo:
                        profilePhotoUrl

                }

            });

        }

        catch (error) {

            console.log(
                "Register server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

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

                    success: false,

                    message:
                        "Email and password are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

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

                    success: false,

                    message:
                        "Unable to login."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found. Please register."

                });

            }

            const user =
                users[0];

            if (
                user.password !==
                password
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Incorrect email or password."

                });

            }

            return res.json({

                success: true,

                message:
                    "Login successful.",

                user: {

                    id:
                        user.id || "",

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    phone:
                        user.phone || "",

                    profile_photo:
                        user.profile_photo || ""

                }

            });

        }

        catch (error) {

            console.log(
                "Login server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// CHANGE / UPLOAD PROFILE PHOTO
// ==================================================

app.post(
    "/profile-photo",
    uploadProfilePhoto,
    async (req, res) => {

        try {

            const {
                email
            } = req.body;

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select a profile photo."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: users,
                error: userError
            } = await supabase
                .from("users")
                .select(
                    "id,name,email,phone,profile_photo"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (userError) {

                console.log(
                    "Profile user search error:",
                    userError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to find user."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }

            const user =
                users[0];

            const extension =
                getPhotoExtension(
                    req.file.mimetype
                );

            const filePath =
                `users/${user.id}/profile.${extension}`;

            const {
                error: uploadError
            } = await supabase
                .storage
                .from(PROFILE_PHOTOS_BUCKET)
                .upload(
                    filePath,
                    req.file.buffer,
                    {
                        contentType:
                            req.file.mimetype,

                        upsert:
                            true
                    }
                );

            if (uploadError) {

                console.log(
                    "Change photo upload error:",
                    uploadError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to upload new profile photo."

                });

            }

            const {
                data: publicUrlData
            } = supabase
                .storage
                .from(PROFILE_PHOTOS_BUCKET)
                .getPublicUrl(filePath);

            const profilePhotoUrl =
                publicUrlData.publicUrl +
                "?v=" +
                Date.now();

            const {
                error: updateError
            } = await supabase
                .from("users")
                .update({

                    profile_photo:
                        profilePhotoUrl

                })
                .eq(
                    "id",
                    user.id
                );

            if (updateError) {

                console.log(
                    "Change photo database error:",
                    updateError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Photo uploaded but database update failed."

                });

            }

            await deleteOldProfilePhotos(
                user.id,
                filePath
            );

            return res.json({

                success: true,

                message:
                    "Profile photo updated successfully.",

                profile_photo:
                    profilePhotoUrl,

                user: {

                    id:
                        user.id,

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    phone:
                        user.phone || "",

                    profile_photo:
                        profilePhotoUrl

                }

            });

        }

        catch (error) {

            console.log(
                "Profile photo server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// GET CURRENT USER PROFILE
// ==================================================

app.get(
    "/profile",
    async (req, res) => {

        try {

            const email =
                req.query.email;

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: users,
                error
            } = await supabase
                .from("users")
                .select(
                    "id,name,email,phone,profile_photo"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (error) {

                console.log(
                    "Profile error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to get profile."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }

            const user =
                users[0];

            return res.json({

                success: true,

                user: {

                    id:
                        user.id || "",

                    name:
                        user.name || "",

                    email:
                        user.email || "",

                    phone:
                        user.phone || "",

                    profile_photo:
                        user.profile_photo || ""

                }

            });

        }

        catch (error) {

            console.log(
                "Profile server error:",
                error
            );

            return res.status(500).json({

                success: false,

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

                    success: false,

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

                    success: false,

                    message:
                        "Please enter a valid 10-digit phone number."

                });

            }

            const {
                data: users,
                error
            } = await supabase
                .from("users")
                .select(
                    "id,email,phone"
                )
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

                    success: false,

                    message:
                        "Unable to change password."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Email and phone number do not match."

                });

            }

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

                    success: false,

                    message:
                        "Unable to change password."

                });

            }

            return res.json({

                success: true,

                message:
                    "Password changed successfully."

            });

        }

        catch (error) {

            console.log(
                "Forgot password server error:",
                error
            );

            return res.status(500).json({

                success: false,

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
                .select(
                    "id,name,email,phone,profile_photo"
                )
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

                            ID:
                                user.id || "",

                            Name:
                                user.name || "",

                            Email:
                                user.email || "",

                            Phone:
                                user.phone || "",

                            ProfilePhoto:
                                user.profile_photo || ""

                        };

                    }
                );

            return res.json(
                safeUsers
            );

        }

        catch (error) {

            console.log(error);

            return res.status(500).json({

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

            if (
                currentBook.rented_by
            ) {

                return res.status(400).json({

                    message:
                        "This book is already rented."

                });

            }

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

            const rentDate =
                new Date().toISOString();

            const {
                error: transactionError
            } = await supabase
                .from("transactions")
                .insert({

                    name:
                        name,

                    email:
                        cleanEmail,

                    book_name:
                        book,

                    author:
                        author,

                    rent_date:
                        rentDate,

                    submit_date:
                        null,

                    status:
                        "RENTED"

                });

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

            return res.json({

                success: true,

                message:
                    "Book rented successfully."

            });

        }

        catch (error) {

            console.log(
                "Rent server error:",
                error
            );

            return res.status(500).json({

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

            if (
                !currentBook.rented_by
            ) {

                return res.status(400).json({

                    message:
                        "This book is already available."

                });

            }

            if (
                currentBook.rented_by !==
                name
            ) {

                return res.status(403).json({

                    message:
                        "Only the person who rented this book can submit it."

                });

            }

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

                return res.status(500).json({

                    message:
                        "Unable to update transaction."

                });

            }

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

            if (updateBookError) {

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

            return res.json({

                success: true,

                message:
                    "Book submitted successfully."

            });

        }

        catch (error) {

            console.log(
                "Submit server error:",
                error
            );

            return res.status(500).json({

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

                            Price:
                                Number(book.price) || 0,

                            price:
                                Number(book.price) || 0,

                            RentedBy:
                                book.rented_by || ""

                        };

                    }
                );

            return res.json(
                formattedBooks
            );

        }

        catch (error) {

            console.log(
                "Get books server error:",
                error
            );

            return res.status(500).json({

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
                    "ADMIN GET BOOKS ERROR:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get books.",

                    error:
                        error.message

                });

            }

            const formattedBooks =
                (books || []).map(
                    function (book) {

                        const bookPrice =
                            Number(book.price) || 0;

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

                            Price:
                                bookPrice,

                            price:
                                bookPrice,

                            RentedBy:
                                book.rented_by || ""

                        };

                    }
                );

            return res.json(
                formattedBooks
            );

        }

        catch (error) {

            console.log(
                "Admin get books error:",
                error
            );

            return res.status(500).json({

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
                description,
                price
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

            const finalPrice =
                Number(price) || 0;

            const {
                data: newBook,
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

                    price:
                        finalPrice,

                    rented_by:
                        ""

                })
                .select("*")
                .single();

            if (error) {

                console.log(
                    "ADD BOOK SUPABASE ERROR:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to add book.",

                    error:
                        error.message

                });

            }

            return res.json({

                success: true,

                message:
                    "Book added successfully.",

                book: {

                    ID:
                        newBook.id,

                    Name:
                        newBook.name,

                    Author:
                        newBook.author,

                    Category:
                        newBook.category,

                    Year:
                        newBook.year,

                    Image:
                        newBook.image,

                    Description:
                        newBook.description,

                    Price:
                        Number(newBook.price) || 0,

                    price:
                        Number(newBook.price) || 0,

                    RentedBy:
                        newBook.rented_by || ""

                }

            });

        }

        catch (error) {

            console.log(
                "Add book server error:",
                error
            );

            return res.status(500).json({

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
                description,
                price
            } = req.body;

            const updateData = {};

            if (name) {
                updateData.name = name;
            }

            if (author) {
                updateData.author = author;
            }

            if (category) {
                updateData.category = category;
            }

            if (year) {
                updateData.year = Number(year);
            }

            if (
                image !== undefined
            ) {
                updateData.image = image;
            }

            if (
                description !== undefined
            ) {
                updateData.description =
                    description;
            }

            if (
                price !== undefined
            ) {
                updateData.price =
                    Number(price) || 0;
            }

            const {
                data: updatedBook,
                error
            } = await supabase
                .from("books")
                .update(updateData)
                .eq(
                    "id",
                    bookId
                )
                .select("*")
                .single();

            if (error) {

                console.log(
                    "UPDATE BOOK SUPABASE ERROR:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to update book.",

                    error:
                        error.message

                });

            }

            const finalPrice =
                Number(updatedBook.price) || 0;

            return res.json({

                success: true,

                message:
                    "Book updated successfully.",

                book: {

                    ID:
                        updatedBook.id,

                    Name:
                        updatedBook.name,

                    Author:
                        updatedBook.author,

                    Category:
                        updatedBook.category,

                    Year:
                        updatedBook.year,

                    Image:
                        updatedBook.image,

                    Description:
                        updatedBook.description,

                    Price:
                        finalPrice,

                    price:
                        finalPrice,

                    RentedBy:
                        updatedBook.rented_by || ""

                }

            });

        }

        catch (error) {

            console.log(
                "Update book server error:",
                error
            );

            return res.status(500).json({

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

            const {
                data: books,
                error: findError
            } = await supabase
                .from("books")
                .select(
                    "id,rented_by"
                )
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

            return res.json({

                success: true,

                message:
                    "Book deleted successfully."

            });

        }

        catch (error) {

            console.log(error);

            return res.status(500).json({

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
                .select(
                    "id,name,email,phone,profile_photo"
                )
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

                            ID:
                                user.id || "",

                            Name:
                                user.name || "",

                            Email:
                                user.email || "",

                            Phone:
                                user.phone || "",

                            ProfilePhoto:
                                user.profile_photo || ""

                        };

                    }
                );

            return res.json(
                safeUsers
            );

        }

        catch (error) {

            console.log(error);

            return res.status(500).json({

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

                            ID:
                                transaction.id,

                            User:
                                transaction.name || "",

                            Email:
                                transaction.email || "",

                            Book:
                                transaction.book_name || "",

                            Author:
                                transaction.author || "",

                            Date:
                                transaction.rent_date || "",

                            RentDate:
                                transaction.rent_date || "",

                            SubmitDate:
                                transaction.submit_date || "",

                            Action:
                                transaction.status || "",

                            Status:
                                transaction.status || ""

                        };

                    }
                );

            return res.json(
                result
            );

        }

        catch (error) {

            console.log(
                "Transaction server error:",
                error
            );

            return res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// USER - ATTENDANCE ENTER
// ==================================================

app.post(
    "/attendance/enter",
    async (req, res) => {

        try {

            const {
                email
            } = req.body;

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: users,
                error: userError
            } = await supabase
                .from("users")
                .select(
                    "id,name,email"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (userError) {

                console.log(
                    "Attendance user error:",
                    userError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to verify user."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found. Please login again."

                });

            }

            const user =
                users[0];

            const {
                data: activeAttendance,
                error: activeError
            } = await supabase
                .from("attendance")
                .select(
                    "id,entry_time,exit_time,status"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "status",
                    "INSIDE"
                )
                .is(
                    "exit_time",
                    null
                )
                .order(
                    "entry_time",
                    {
                        ascending: false
                    }
                )
                .limit(1);

            if (activeError) {

                console.log(
                    "Attendance active check error:",
                    activeError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to check attendance."

                });

            }

            if (
                activeAttendance &&
                activeAttendance.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "You are already inside the library.",

                    attendance:
                        activeAttendance[0]

                });

            }

            const entryTime =
                new Date().toISOString();

            const {
                data: attendance,
                error: insertError
            } = await supabase
                .from("attendance")
                .insert({

                    user_id:
                        String(user.id),

                    name:
                        user.name || "",

                    email:
                        cleanEmail,

                    entry_time:
                        entryTime,

                    exit_time:
                        null,

                    status:
                        "INSIDE"

                })
                .select("*")
                .single();

            if (insertError) {

                console.log(
                    "Attendance insert error:",
                    insertError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to record library entry."

                });

            }

            return res.json({

                success: true,

                message:
                    "Entry recorded successfully.",

                attendance:
                    attendance

            });

        }

        catch (error) {

            console.log(
                "Attendance enter server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// USER - ATTENDANCE EXIT
// ==================================================

app.post(
    "/attendance/exit",
    async (req, res) => {

        try {

            const {
                email
            } = req.body;

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: activeAttendance,
                error: findError
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "status",
                    "INSIDE"
                )
                .is(
                    "exit_time",
                    null
                )
                .order(
                    "entry_time",
                    {
                        ascending: false
                    }
                )
                .limit(1);

            if (findError) {

                console.log(
                    "Attendance exit find error:",
                    findError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to find active attendance."

                });

            }

            if (
                !activeAttendance ||
                activeAttendance.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "No active library entry found."

                });

            }

            const record =
                activeAttendance[0];

            const exitTime =
                new Date().toISOString();

            const {
                data: updatedAttendance,
                error: updateError
            } = await supabase
                .from("attendance")
                .update({

                    exit_time:
                        exitTime,

                    status:
                        "OUTSIDE"

                })
                .eq(
                    "id",
                    record.id
                )
                .select("*")
                .single();

            if (updateError) {

                console.log(
                    "Attendance exit update error:",
                    updateError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to record library exit."

                });

            }

            return res.json({

                success: true,

                message:
                    "Exit recorded successfully.",

                attendance:
                    updatedAttendance

            });

        }

        catch (error) {

            console.log(
                "Attendance exit server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// USER - CURRENT ATTENDANCE STATUS
// ==================================================

app.get(
    "/attendance/status",
    async (req, res) => {

        try {

            const email =
                req.query.email;

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: activeAttendance,
                error
            } = await supabase
                .from("attendance")
                .select(
                    "id,name,email,entry_time,exit_time,status"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "status",
                    "INSIDE"
                )
                .is(
                    "exit_time",
                    null
                )
                .order(
                    "entry_time",
                    {
                        ascending: false
                    }
                )
                .limit(1);

            if (error) {

                console.log(
                    "Attendance status error:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to get attendance status."

                });

            }

            return res.json({

                success: true,

                inside:
                    !!(
                        activeAttendance &&
                        activeAttendance.length > 0
                    ),

                attendance:
                    activeAttendance &&
                    activeAttendance.length > 0
                        ? activeAttendance[0]
                        : null

            });

        }

        catch (error) {

            console.log(
                "Attendance status server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - GET ATTENDANCE
// ==================================================

app.get(
    "/admin/attendance",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                data: attendance,
                error
            } = await supabase
                .from("attendance")
                .select(
                    "id,user_id,name,email,entry_time,exit_time,status"
                )
                .order(
                    "entry_time",
                    {
                        ascending: false
                    }
                );

            if (error) {

                console.log(
                    "Admin attendance error:",
                    error
                );

                return res.status(500).json({

                    message:
                        "Unable to get attendance."

                });

            }

            const result =
                (attendance || []).map(
                    function (record) {

                        return {

                            ID:
                                record.id,

                            UserID:
                                record.user_id || "",

                            Name:
                                record.name || "",

                            Email:
                                record.email || "",

                            EntryTime:
                                record.entry_time || "",

                            ExitTime:
                                record.exit_time || "",

                            Status:
                                record.status || ""

                        };

                    }
                );

            return res.json(
                result
            );

        }

        catch (error) {

            console.log(
                "Admin attendance server error:",
                error
            );

            return res.status(500).json({

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// DELETE USER ACCOUNT
// ==================================================

app.delete(
    "/account",
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

                    success: false,

                    message:
                        "Email and password are required."

                });

            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: users,
                error: findError
            } = await supabase
                .from("users")
                .select(
                    "id,email,password"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (findError) {

                console.log(
                    "Delete account find error:",
                    findError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to find account."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Account not found."

                });

            }

            const userId =
                users[0].id;

            if (
                users[0].password !==
                password
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Incorrect password. Account was not deleted."

                });

            }

            const {
                data: activeRentals,
                error: rentalError
            } = await supabase
                .from("transactions")
                .select(
                    "id,book_name"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "status",
                    "RENTED"
                )
                .is(
                    "submit_date",
                    null
                );

            if (rentalError) {

                console.log(
                    "Delete account rental check error:",
                    rentalError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to check active book rentals."

                });

            }

            if (
                activeRentals &&
                activeRentals.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please submit all rented books before deleting your account."

                });

            }

            await supabase
                .from("attendance")
                .delete()
                .eq(
                    "email",
                    cleanEmail
                );

            await supabase
                .from("transactions")
                .delete()
                .eq(
                    "email",
                    cleanEmail
                );

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

                console.log(
                    "Delete account error:",
                    deleteError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to delete account."

                });

            }

            const possibleFiles = [

                `users/${userId}/profile.jpg`,

                `users/${userId}/profile.png`,

                `users/${userId}/profile.webp`,

                `users/${userId}/profile.gif`

            ];

            try {

                await supabase
                    .storage
                    .from(PROFILE_PHOTOS_BUCKET)
                    .remove(
                        possibleFiles
                    );

            }

            catch (photoError) {

                console.log(
                    "Account photo delete warning:",
                    photoError
                );

            }

            return res.json({

                success: true,

                message:
                    "Account deleted successfully."

            });

        }

        catch (error) {

            console.log(
                "Delete account server error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

// ==================================================
// ADMIN - DELETE USER ACCOUNT
// ==================================================

app.delete(
    "/admin/users/:email",
    checkAdmin,
    async (req, res) => {

        try {

            const cleanEmail =
                decodeURIComponent(
                    req.params.email
                )
                    .toString()
                    .trim()
                    .toLowerCase();

            const {
                data: users,
                error: findError
            } = await supabase
                .from("users")
                .select(
                    "id,email"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (findError) {

                console.log(
                    "Admin delete user find error:",
                    findError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to find user."

                });

            }

            if (
                !users ||
                users.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }

            const userId =
                users[0].id;

            const {
                data: activeRentals,
                error: rentalError
            } = await supabase
                .from("transactions")
                .select(
                    "id"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "status",
                    "RENTED"
                )
                .is(
                    "submit_date",
                    null
                );

            if (rentalError) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to check active rentals."

                });

            }

            if (
                activeRentals &&
                activeRentals.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "User has active rented books. Submit them before deleting the account."

                });

            }

            await supabase
                .from("attendance")
                .delete()
                .eq(
                    "email",
                    cleanEmail
                );

            await supabase
                .from("transactions")
                .delete()
                .eq(
                    "email",
                    cleanEmail
                );

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

                console.log(
                    "Admin delete user error:",
                    deleteError
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Unable to delete user."

                });

            }

            try {

                await supabase
                    .storage
                    .from(PROFILE_PHOTOS_BUCKET)
                    .remove([

                        `users/${userId}/profile.jpg`,

                        `users/${userId}/profile.png`,

                        `users/${userId}/profile.webp`,

                        `users/${userId}/profile.gif`

                    ]);

            }

            catch (photoError) {

                console.log(
                    "Admin user photo delete warning:",
                    photoError
                );

            }

            return res.json({

                success: true,

                message:
                    "User account deleted successfully."

            });

        }

        catch (error) {

            console.log(
                "Admin delete user server error:",
                error
            );

            return res.status(500).json({

                success: false,

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

                    success: false,

                    error:
                        error.message

                });

            }

            return res.json({

                success: true,

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

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);

// ==================================================
// HEALTH CHECK
// ==================================================

app.get(
    "/",
    (req, res) => {

        res.send(
            "Atal Library backend is running successfully."
        );

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