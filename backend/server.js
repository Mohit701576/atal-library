require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { Resend } = require("resend");

// ==================================================
// ENVIRONMENT
// ==================================================

if (!process.env.SUPABASE_URL) {
    console.log("WARNING: SUPABASE_URL is missing.");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("WARNING: SUPABASE_SERVICE_ROLE_KEY is missing.");
}

if (!process.env.RESEND_API_KEY) {
    console.log("WARNING: RESEND_API_KEY is missing.");
}

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

const PORT =
    process.env.PORT || 3000;

app.set("trust proxy", 1);

// ==================================================
// CORS
// ==================================================

app.use(
    cors({
        origin: true,

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

// ==================================================
// BODY PARSER
// ==================================================

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
// STATIC FILES
// ==================================================

app.use(
    express.static(
        path.join(__dirname, "..")
    )
);

// ==================================================
// PROFILE PHOTO
// ==================================================

const PROFILE_PHOTOS_BUCKET =
    "profile-photos";

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (
        req,
        file,
        cb
    ) => {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (
            allowedTypes.includes(
                file.mimetype
            )
        ) {
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

function uploadProfilePhoto(
    req,
    res,
    next
) {

    upload.single("profile_photo")(
        req,
        res,
        function (err) {

            if (
                err instanceof
                multer.MulterError
            ) {

                if (
                    err.code ===
                    "LIMIT_FILE_SIZE"
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Profile photo must be 5 MB or smaller."
                    });
                }

                return res.status(400).json({
                    success: false,
                    message:
                        err.message
                });
            }

            if (err) {

                return res.status(400).json({
                    success: false,
                    message:
                        err.message
                });
            }

            next();
        }
    );
}

function getPhotoExtension(
    mimetype
) {

    if (
        mimetype ===
        "image/png"
    ) {
        return "png";
    }

    if (
        mimetype ===
        "image/webp"
    ) {
        return "webp";
    }

    if (
        mimetype ===
        "image/gif"
    ) {
        return "gif";
    }

    return "jpg";
}

async function saveProfilePhoto(
    userId,
    file
) {

    const extension =
        getPhotoExtension(
            file.mimetype
        );

    const filePath =
        `users/${userId}/profile.${extension}`;

    const {
        error
    } = await supabase
        .storage
        .from(
            PROFILE_PHOTOS_BUCKET
        )
        .upload(
            filePath,
            file.buffer,
            {
                contentType:
                    file.mimetype,
                upsert: true
            }
        );

    if (error) {
        throw error;
    }

    const {
        data
    } =
        supabase
            .storage
            .from(
                PROFILE_PHOTOS_BUCKET
            )
            .getPublicUrl(
                filePath
            );

    if (
        !data ||
        !data.publicUrl
    ) {

        throw new Error(
            "Unable to create profile photo URL."
        );
    }

    return (
        data.publicUrl +
        "?v=" +
        Date.now()
    );
}

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
            filePath =>
                filePath !==
                currentFilePath
        );

    try {

        const {
            error
        } = await supabase
            .storage
            .from(
                PROFILE_PHOTOS_BUCKET
            )
            .remove(
                filesToDelete
            );

        if (error) {

            console.log(
                "Old profile photo delete warning:",
                error
            );
        }

    } catch (error) {

        console.log(
            "Old profile photo delete warning:",
            error
        );
    }
}

async function deleteAllProfilePhotos(
    userId
) {

    const files = [

        `users/${userId}/profile.jpg`,
        `users/${userId}/profile.png`,
        `users/${userId}/profile.webp`,
        `users/${userId}/profile.gif`

    ];

    try {

        const {
            error
        } = await supabase
            .storage
            .from(
                PROFILE_PHOTOS_BUCKET
            )
            .remove(
                files
            );

        if (error) {

            console.log(
                "Profile photo delete warning:",
                error
            );
        }

    } catch (error) {

        console.log(
            "Profile photo delete warning:",
            error
        );
    }
}

// ==================================================
// RESEND
// ==================================================

const resend =
    process.env.RESEND_API_KEY
        ? new Resend(
            process.env.RESEND_API_KEY
        )
        : null;

// ==================================================
// OTP
// ==================================================

function generateOTP() {

    return Math.floor(
        100000 +
        Math.random() * 900000
    ).toString();
}

const emailOtps = {};

// ==================================================
// ADMIN
// ==================================================

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME ||
    "admin";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "admin123";

let adminToken = null;

function checkAdmin(
    req,
    res,
    next
) {

    const authHeader =
        req.headers.authorization ||
        "";

    const token =
        authHeader.startsWith(
            "Bearer "
        )
            ? authHeader.slice(7)
            : "";

    if (
        !adminToken ||
        token !== adminToken
    ) {

        return res.status(401).json({
            success: false,
            message:
                "Admin login required."
        });
    }

    next();
}

// ==================================================
// DATE / TIME HELPERS
// ==================================================

function getTodayDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone:
                "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(
        new Date()
    );
}

function getCurrentTime() {

    return new Date().toISOString();
}

// ==================================================
// ADMIN LOGIN
// ==================================================

app.post(
    "/admin-login",
    (req, res) => {

        try {

            const {
                username,
                password
            } = req.body;

            if (
                username !==
                ADMIN_USERNAME ||
                password !==
                ADMIN_PASSWORD
            ) {

                return res.status(401).json({
                    success: false,
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

        } catch (error) {

            console.log(
                "Admin login error:",
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
                    success: false,
                    message:
                        "Email is required."
                });
            }

            if (!resend) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Email service is not configured on server."
                });
            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            console.log(
                "SEND OTP REQUEST:",
                cleanEmail
            );

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

            const otp =
                generateOTP();

            emailOtps[cleanEmail] = {
                otp: otp,

                expiresAt:
                    Date.now() +
                    5 * 60 * 1000,

                verified:
                    false
            };

            const {
                data,
                error
            } =
                await resend.emails.send({

                    from:
                        "Atal Library <onboarding@resend.dev>",

                    to: [
                        cleanEmail
                    ],

                    subject:
                        "Atal Library - Email Verification OTP",

                    text:
                        `Your Atal Library verification OTP is ${otp}.

This OTP is valid for 5 minutes.

Please do not share this OTP with anyone.`
                });

            if (error) {

                delete emailOtps[
                    cleanEmail
                ];

                console.log(
                    "RESEND ERROR:",
                    JSON.stringify(
                        error,
                        null,
                        2
                    )
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to send OTP. Please try again."
                });
            }

            console.log(
                "OTP SENT:",
                data
                    ? data.id
                    : ""
            );

            return res.json({
                success: true,
                message:
                    "OTP sent to your email."
            });

        } catch (error) {

            console.log(
                "OTP SEND ERROR:",
                error
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
                emailOtps[
                    cleanEmail
                ];

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

                delete emailOtps[
                    cleanEmail
                ];

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

            savedOTP.verified =
                true;

            return res.json({
                success: true,
                message:
                    "Email verified successfully."
            });

        } catch (error) {

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
// REGISTER
// ==================================================

app.post(
    "/register",
    uploadProfilePhoto,
    async (req, res) => {

        try {

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
                .select(
                    "id,email"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (userCheckError) {

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
                emailOtps[
                    cleanEmail
                ];

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
                    "Register error:",
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

            } catch (photoError) {

                console.log(
                    "Profile photo error:",
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
                error:
                    photoUpdateError
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

                return res.status(500).json({
                    success: false,
                    message:
                        "Photo uploaded but could not be saved."
                });
            }

            delete emailOtps[
                cleanEmail
            ];

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

        } catch (error) {

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
// ATTENDANCE HELPER
// ==================================================

async function markLoginAttendance(
    name,
    email
) {

    try {

        const cleanEmail =
            email
                .toString()
                .trim()
                .toLowerCase();

        const today =
            getTodayDate();

        const {
            data: existing,
            error: checkError
        } = await supabase
            .from("attendance")
            .select("*")
            .eq(
                "email",
                cleanEmail
            )
            .eq(
                "date",
                today
            )
            .limit(1);

        if (checkError) {

            console.log(
                "Attendance check warning:",
                checkError
            );

            return;
        }

        if (
            existing &&
            existing.length > 0
        ) {

            console.log(
                "Attendance already marked:",
                cleanEmail,
                today
            );

            return;
        }

        const {
            error: insertError
        } = await supabase
            .from("attendance")
            .insert({

                name:
                    name
                        .toString()
                        .trim(),

                email:
                    cleanEmail,

                date:
                    today,

                status:
                    "Present",

                entry_time:
                    getCurrentTime(),

                exit_time:
                    null
            });

        if (insertError) {

            console.log(
                "Attendance insert warning:",
                insertError
            );

            return;
        }

        console.log(
            "ATTENDANCE MARKED:",
            cleanEmail,
            today
        );

    } catch (error) {

        console.log(
            "Attendance helper warning:",
            error
        );
    }
}

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

            await markLoginAttendance(
                user.name || "",
                user.email
            );

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

        } catch (error) {

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
// PROFILE PHOTO UPDATE
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
                .from(
                    PROFILE_PHOTOS_BUCKET
                )
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

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to upload new profile photo."
                });
            }

            const {
                data
            } =
                supabase
                    .storage
                    .from(
                        PROFILE_PHOTOS_BUCKET
                    )
                    .getPublicUrl(
                        filePath
                    );

            const profilePhotoUrl =
                data.publicUrl +
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

        } catch (error) {

            console.log(
                "Profile photo error:",
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
// GET PROFILE
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

        } catch (error) {

            console.log(
                "Profile error:",
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

            const {
                error:
                    updateError
            } = await supabase
                .from("users")
                .update({
                    password:
                        newPassword
                })
                .eq(
                    "id",
                    users[0].id
                );

            if (updateError) {

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

        } catch (error) {

            console.log(
                "Forgot password error:",
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
// USERS
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
                    "name,email,phone,profile_photo"
                )
                .order(
                    "created_at",
                    {
                        ascending:
                            false
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get users."
                });
            }

            return res.json(
                (users || []).map(
                    user => ({

                        Name:
                            user.name || "",

                        Email:
                            user.email || "",

                        Phone:
                            user.phone || "",

                        ProfilePhoto:
                            user.profile_photo || ""
                    })
                )
            );

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// ATTENDANCE HELPER
// ==================================================

async function getAttendanceByEmail(
    email
) {

    const cleanEmail =
        email
            .toString()
            .trim()
            .toLowerCase();

    const {
        data,
        error
    } = await supabase
        .from("attendance")
        .select("*")
        .eq(
            "email",
            cleanEmail
        )
        .order(
            "date",
            {
                ascending:
                    false
            }
        );

    return {
        data:
            data || [],
        error
    };
}

// ==================================================
// FORMAT ATTENDANCE
// ==================================================

function formatAttendance(
    record
) {

    return {

        ID:
            record.id || "",

        Name:
            record.name || "",

        Email:
            record.email || "",

        Date:
            record.date || "",

        EntryTime:
            record.entry_time ||
            record.entryTime ||
            "",

        ExitTime:
            record.exit_time ||
            record.exitTime ||
            "",

        Status:
            record.status || ""
    };
}

// ==================================================
// GET /attendance
// ==================================================

app.get(
    "/attendance",
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

            const {
                data,
                error
            } =
                await getAttendanceByEmail(
                    email
                );

            if (error) {

                console.log(
                    "ATTENDANCE ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                attendance:
                    data,
                data:
                    data
            });

        } catch (error) {

            console.log(
                "Attendance error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while getting attendance."
            });
        }
    }
);

// ==================================================
// GET /attendance/:email
// ==================================================

app.get(
    "/attendance/:email",
    async (req, res) => {

        try {

            const email =
                decodeURIComponent(
                    req.params.email
                );

            const {
                data,
                error
            } =
                await getAttendanceByEmail(
                    email
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                attendance:
                    data,
                data:
                    data
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// USER ATTENDANCE ALIASES
// ==================================================

app.get(
    "/user/attendance",
    async (req, res) => {

        try {

            const email =
                req.query.email ||
                req.query.userEmail;

            if (!email) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email is required."
                });
            }

            const {
                data,
                error
            } =
                await getAttendanceByEmail(
                    email
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                attendance:
                    data,
                data:
                    data
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

app.get(
    "/user-attendance",
    async (req, res) => {

        try {

            const email =
                req.query.email ||
                req.query.userEmail;

            if (!email) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email is required."
                });
            }

            const {
                data,
                error
            } =
                await getAttendanceByEmail(
                    email
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                attendance:
                    data,
                data:
                    data
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

app.get(
    "/my-attendance",
    async (req, res) => {

        try {

            const email =
                req.query.email ||
                req.query.userEmail;

            if (!email) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email is required."
                });
            }

            const {
                data,
                error
            } =
                await getAttendanceByEmail(
                    email
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                attendance:
                    data,
                data:
                    data
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// POST /attendance
// ==================================================

app.post(
    "/attendance",
    async (req, res) => {

        try {

            const {
                name,
                email,
                date,
                status
            } = req.body;

            if (
                !name ||
                !email
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name and email are required."
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

            const cleanDate =
                date
                    ? date
                        .toString()
                        .trim()
                    : getTodayDate();

            const cleanStatus =
                status
                    ? status
                        .toString()
                        .trim()
                    : "Present";

            const {
                data: existing,
                error: checkError
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "date",
                    cleanDate
                )
                .limit(1);

            if (checkError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to check attendance.",
                    error:
                        checkError.message
                });
            }

            if (
                existing &&
                existing.length > 0
            ) {

                return res.json({
                    success: true,
                    message:
                        "Attendance already exists for this date.",
                    attendance:
                        existing[0]
                });
            }

            const {
                data: attendance,
                error
            } = await supabase
                .from("attendance")
                .insert({

                    name:
                        cleanName,

                    email:
                        cleanEmail,

                    date:
                        cleanDate,

                    status:
                        cleanStatus,

                    entry_time:
                        getCurrentTime(),

                    exit_time:
                        null
                })
                .select("*")
                .single();

            if (error) {

                console.log(
                    "ADD ATTENDANCE ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to save attendance.",
                    error:
                        error.message
                });
            }

            return res.status(201).json({
                success: true,
                message:
                    "Attendance saved successfully.",
                attendance
            });

        } catch (error) {

            console.log(
                "POST attendance error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while saving attendance."
            });
        }
    }
);

// ==================================================
// POST /attendance/enter
// ==================================================

app.post(
    "/attendance/enter",
    async (req, res) => {

        try {

            const {
                name,
                email,
                date,
                status
            } = req.body;

            if (
                !name ||
                !email
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name and email are required."
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

            const cleanDate =
                date
                    ? date
                        .toString()
                        .trim()
                    : getTodayDate();

            const cleanStatus =
                status
                    ? status
                        .toString()
                        .trim()
                    : "Present";

            const {
                data: existing,
                error: checkError
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "date",
                    cleanDate
                )
                .limit(1);

            if (checkError) {

                console.log(
                    "Attendance enter check error:",
                    checkError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to check attendance.",
                    error:
                        checkError.message
                });
            }

            if (
                existing &&
                existing.length > 0
            ) {

                return res.json({
                    success: true,
                    message:
                        "Attendance already marked.",
                    attendance:
                        existing[0]
                });
            }

            const {
                data: attendance,
                error: insertError
            } = await supabase
                .from("attendance")
                .insert({

                    name:
                        cleanName,

                    email:
                        cleanEmail,

                    date:
                        cleanDate,

                    status:
                        cleanStatus,

                    entry_time:
                        getCurrentTime(),

                    exit_time:
                        null
                })
                .select("*")
                .single();

            if (insertError) {

                console.log(
                    "Attendance enter insert error:",
                    insertError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to save attendance.",
                    error:
                        insertError.message
                });
            }

            return res.status(201).json({
                success: true,
                message:
                    "Attendance entered successfully.",
                attendance
            });

        } catch (error) {

            console.log(
                "POST /attendance/enter error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while entering attendance."
            });
        }
    }
);

// ==================================================
// POST /attendance/exit
// ==================================================

app.post(
    "/attendance/exit",
    async (req, res) => {

        try {

            const {
                name,
                email,
                date
            } = req.body;

            if (
                !name ||
                !email
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name and email are required."
                });
            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const cleanDate =
                date
                    ? date
                        .toString()
                        .trim()
                    : getTodayDate();

            const {
                data: records,
                error: findError
            } = await supabase
                .from("attendance")
                .select("*")
                .eq(
                    "email",
                    cleanEmail
                )
                .eq(
                    "date",
                    cleanDate
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
                        "Unable to find today's attendance.",
                    error:
                        findError.message
                });
            }

            if (
                !records ||
                records.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Please enter the library first."
                });
            }

            const attendance =
                records[0];

            if (
                attendance.exit_time ||
                attendance.exitTime
            ) {

                return res.json({
                    success: true,
                    message:
                        "Library exit is already marked.",
                    attendance
                });
            }

            const {
                data: updatedAttendance,
                error: updateError
            } = await supabase
                .from("attendance")
                .update({

                    exit_time:
                        getCurrentTime(),

                    status:
                        "Completed"
                })
                .eq(
                    "id",
                    attendance.id
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
                        "Unable to save library exit.",
                    error:
                        updateError.message
                });
            }

            return res.json({
                success: true,
                message:
                    "Library exit recorded successfully.",
                attendance:
                    updatedAttendance
            });

        } catch (error) {

            console.log(
                "POST /attendance/exit error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while recording exit."
            });
        }
    }
);

// ==================================================
// ADMIN ATTENDANCE
// ==================================================

app.get(
    "/admin/attendance",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                data,
                error
            } = await supabase
                .from("attendance")
                .select("*")
                .order(
                    "date",
                    {
                        ascending:
                            false
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            // IMPORTANT:
            // Admin dashboard expects an ARRAY directly.

            return res.json(
                (data || []).map(
                    record =>
                        formatAttendance(
                            record
                        )
                )
            );

        } catch (error) {

            console.log(
                "Admin attendance error:",
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
// ADMIN ATTENDANCE ALIAS
// ==================================================

app.get(
    "/attendance/admin",
    checkAdmin,
    async (req, res) => {

        try {

            const {
                data,
                error
            } = await supabase
                .from("attendance")
                .select("*")
                .order(
                    "date",
                    {
                        ascending:
                            false
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get attendance.",
                    error:
                        error.message
                });
            }

            return res.json(
                (data || []).map(
                    record =>
                        formatAttendance(
                            record
                        )
                )
            );

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// ADMIN DELETE ATTENDANCE
// ==================================================

app.delete(
    "/admin/attendance/:id",
    checkAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !id ||
                Number.isNaN(id)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid attendance ID."
                });
            }

            const {
                error
            } = await supabase
                .from("attendance")
                .delete()
                .eq(
                    "id",
                    id
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete attendance.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                message:
                    "Attendance deleted successfully."
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
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
                    success: false,
                    message:
                        "Book and user information are required."
                });
            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const id =
                Number(bookId);

            if (
                !id ||
                Number.isNaN(id)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid book ID."
                });
            }

            const {
                data: books,
                error: bookError
            } = await supabase
                .from("books")
                .select("*")
                .eq(
                    "id",
                    id
                )
                .limit(1);

            if (bookError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to find book.",
                    error:
                        bookError.message
                });
            }

            if (
                !books ||
                books.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Book not found."
                });
            }

            if (books[0].rented_by) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This book is already rented."
                });
            }

            const {
                error:
                    updateError
            } = await supabase
                .from("books")
                .update({
                    rented_by:
                        name
                            .toString()
                            .trim()
                })
                .eq(
                    "id",
                    id
                );

            if (updateError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to rent book.",
                    error:
                        updateError.message
                });
            }

            const {
                error:
                    transactionError
            } = await supabase
                .from("transactions")
                .insert({

                    name:
                        name
                            .toString()
                            .trim(),

                    email:
                        cleanEmail,

                    book_name:
                        book,

                    author:
                        author,

                    rent_date:
                        getCurrentTime(),

                    submit_date:
                        null,

                    status:
                        "RENTED"
                });

            if (transactionError) {

                await supabase
                    .from("books")
                    .update({
                        rented_by:
                            ""
                    })
                    .eq(
                        "id",
                        id
                    );

                return res.status(500).json({
                    success: false,
                    message:
                        "Book rented but transaction could not be saved.",
                    error:
                        transactionError.message
                });
            }

            return res.json({
                success: true,
                message:
                    "Book rented successfully."
            });

        } catch (error) {

            console.log(
                "Rent error:",
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
                    success: false,
                    message:
                        "Book and user information are required."
                });
            }

            const cleanEmail =
                email
                    .toString()
                    .trim()
                    .toLowerCase();

            const id =
                Number(bookId);

            const {
                data: books,
                error: bookError
            } = await supabase
                .from("books")
                .select("*")
                .eq(
                    "id",
                    id
                )
                .limit(1);

            if (bookError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to find book.",
                    error:
                        bookError.message
                });
            }

            if (
                !books ||
                books.length === 0
            ) {

                return res.status(404).json({
                    success: false,
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
                    success: false,
                    message:
                        "This book is already available."
                });
            }

            if (
                currentBook.rented_by !==
                name
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only the person who rented this book can submit it."
                });
            }

            const {
                data: transactions,
                error:
                    transactionFindError
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
                        ascending:
                            false
                    }
                )
                .limit(1);

            if (transactionFindError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to find rental transaction.",
                    error:
                        transactionFindError.message
                });
            }

            if (
                !transactions ||
                transactions.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Active rental transaction not found."
                });
            }

            const transaction =
                transactions[0];

            const submitDate =
                getCurrentTime();

            const {
                error:
                    transactionUpdateError
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
                    transaction.id
                );

            if (transactionUpdateError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to update transaction.",
                    error:
                        transactionUpdateError.message
                });
            }

            const {
                error:
                    updateBookError
            } = await supabase
                .from("books")
                .update({
                    rented_by:
                        ""
                })
                .eq(
                    "id",
                    id
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
                        transaction.id
                    );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to make book available."
                });
            }

            return res.json({
                success: true,
                message:
                    "Book submitted successfully."
            });

        } catch (error) {

            console.log(
                "Submit error:",
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
// GET BOOKS
// ==================================================

function formatBook(
    book
) {

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
            Number(
                book.price
            ) || 0,

        price:
            Number(
                book.price
            ) || 0,

        RentedBy:
            book.rented_by || ""
    };
}

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
                        ascending:
                            true
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get books.",
                    error:
                        error.message
                });
            }

            return res.json(
                (books || []).map(
                    formatBook
                )
            );

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// ADMIN BOOKS
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
                        ascending:
                            true
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get books.",
                    error:
                        error.message
                });
            }

            return res.json(
                (books || []).map(
                    formatBook
                )
            );

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// ADMIN ADD BOOK
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
                    success: false,
                    message:
                        "Book name, author, category and year are required."
                });
            }

            const {
                data: book,
                error
            } = await supabase
                .from("books")
                .insert({

                    name:
                        name
                            .toString()
                            .trim(),

                    author:
                        author
                            .toString()
                            .trim(),

                    category:
                        category
                            .toString()
                            .trim(),

                    year:
                        Number(year),

                    image:
                        image || "",

                    description:
                        description || "",

                    price:
                        Number(price) || 0,

                    rented_by:
                        ""
                })
                .select("*")
                .single();

            if (error) {

                return res.status(500).json({
                    success: false,
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
                book:
                    formatBook(book)
            });

        } catch (error) {

            console.log(
                "Admin add book error:",
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
// ADMIN UPDATE BOOK
// ==================================================

app.put(
    "/admin/books/update/:id",
    checkAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !id ||
                Number.isNaN(id)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid book ID."
                });
            }

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

            if (
                name !== undefined
            ) {
                updateData.name =
                    name;
            }

            if (
                author !== undefined
            ) {
                updateData.author =
                    author;
            }

            if (
                category !== undefined
            ) {
                updateData.category =
                    category;
            }

            if (
                year !== undefined
            ) {
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

            if (
                price !== undefined
            ) {
                updateData.price =
                    Number(price) || 0;
            }

            if (
                Object.keys(
                    updateData
                ).length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "No book data provided."
                });
            }

            const {
                data: book,
                error
            } = await supabase
                .from("books")
                .update(
                    updateData
                )
                .eq(
                    "id",
                    id
                )
                .select("*")
                .single();

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to update book.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                message:
                    "Book updated successfully.",
                book:
                    formatBook(book)
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// ADMIN DELETE BOOK
// ==================================================

app.delete(
    "/admin/books/delete/:id",
    checkAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !id ||
                Number.isNaN(id)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid book ID."
                });
            }

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
                    id
                )
                .limit(1);

            if (findError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to find book.",
                    error:
                        findError.message
                });
            }

            if (
                !books ||
                books.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Book not found."
                });
            }

            if (
                books[0].rented_by
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This book is currently issued. Submit the book before deleting it."
                });
            }

            const {
                error
            } = await supabase
                .from("books")
                .delete()
                .eq(
                    "id",
                    id
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete book.",
                    error:
                        error.message
                });
            }

            return res.json({
                success: true,
                message:
                    "Book deleted successfully."
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Server error."
            });
        }
    }
);

// ==================================================
// ADMIN USERS
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
                        ascending:
                            false
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get users.",
                    error:
                        error.message
                });
            }

            return res.json(
                (users || []).map(
                    user => ({

                        ID:
                            user.id || "",

                        Name:
                            user.name || "",

                        Email:
                            user.email || "",

                        Phone:
                            user.phone || "",

                        ProfilePhoto:
                            user.profile_photo || "",

                        profile_photo:
                            user.profile_photo || ""
                    })
                )
            );

        } catch (error) {

            console.log(
                "Admin users error:",
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
// ADMIN DELETE USER
// ==================================================

app.delete(
    "/admin/users/:email",
    checkAdmin,
    async (req, res) => {

        try {

            const email =
                decodeURIComponent(
                    req.params.email
                )
                    .trim()
                    .toLowerCase();

            if (!email) {

                return res.status(400).json({
                    success: false,
                    message:
                        "User email is required."
                });
            }

            const {
                data: users,
                error: findError
            } = await supabase
                .from("users")
                .select(
                    "id,name,email,profile_photo"
                )
                .eq(
                    "email",
                    email
                )
                .limit(1);

            if (findError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to find user.",
                    error:
                        findError.message
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

            // Check active rentals first
            const {
                data: activeTransactions,
                error:
                    transactionCheckError
            } = await supabase
                .from("transactions")
                .select(
                    "id,book_name,status,submit_date"
                )
                .eq(
                    "email",
                    email
                )
                .eq(
                    "status",
                    "RENTED"
                )
                .is(
                    "submit_date",
                    null
                );

            if (transactionCheckError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to check user's active rentals.",
                    error:
                        transactionCheckError.message
                });
            }

            if (
                activeTransactions &&
                activeTransactions.length > 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This user cannot be deleted because they currently have a rented book. Please submit the book first."
                });
            }

            // Delete attendance
            const {
                error:
                    attendanceDeleteError
            } = await supabase
                .from("attendance")
                .delete()
                .eq(
                    "email",
                    email
                );

            if (
                attendanceDeleteError
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete user's attendance.",
                    error:
                        attendanceDeleteError.message
                });
            }

            // Delete transaction history
            const {
                error:
                    transactionDeleteError
            } = await supabase
                .from("transactions")
                .delete()
                .eq(
                    "email",
                    email
                );

            if (
                transactionDeleteError
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete user's transaction history.",
                    error:
                        transactionDeleteError.message
                });
            }

            // Delete user
            const {
                error:
                    userDeleteError
            } = await supabase
                .from("users")
                .delete()
                .eq(
                    "id",
                    user.id
                );

            if (userDeleteError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete user.",
                    error:
                        userDeleteError.message
                });
            }

            // Delete profile photo
            await deleteAllProfilePhotos(
                user.id
            );

            return res.json({
                success: true,
                message:
                    "User deleted successfully."
            });

        } catch (error) {

            console.log(
                "Delete user error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while deleting user."
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
                email
            } = req.body;

            if (!email) {

                return res.status(400).json({
                    success: false,
                    message:
                        "User email is required."
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
                    "id,name,email,profile_photo"
                )
                .eq(
                    "email",
                    cleanEmail
                )
                .limit(1);

            if (findError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to find account.",
                    error:
                        findError.message
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

            const user =
                users[0];

            // Active rental check
            const {
                data: activeTransactions,
                error:
                    transactionCheckError
            } = await supabase
                .from("transactions")
                .select(
                    "id,book_name,status,submit_date"
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

            if (transactionCheckError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to check active rentals.",
                    error:
                        transactionCheckError.message
                });
            }

            if (
                activeTransactions &&
                activeTransactions.length > 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "You cannot delete your account while you have a rented book. Please submit the book first."
                });
            }

            // Delete attendance
            const {
                error:
                    attendanceDeleteError
            } = await supabase
                .from("attendance")
                .delete()
                .eq(
                    "email",
                    cleanEmail
                );

            if (
                attendanceDeleteError
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete attendance records.",
                    error:
                        attendanceDeleteError.message
                });
            }

            // Delete transactions
            const {
                error:
                    transactionDeleteError
            } = await supabase
                .from("transactions")
                .delete()
                .eq(
                    "email",
                    cleanEmail
                );

            if (
                transactionDeleteError
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete transaction history.",
                    error:
                        transactionDeleteError.message
                });
            }

            // Delete user
            const {
                error:
                    userDeleteError
            } = await supabase
                .from("users")
                .delete()
                .eq(
                    "id",
                    user.id
                );

            if (userDeleteError) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to delete account.",
                    error:
                        userDeleteError.message
                });
            }

            // Delete profile photo
            await deleteAllProfilePhotos(
                user.id
            );

            return res.json({
                success: true,
                message:
                    "Account deleted successfully."
            });

        } catch (error) {

            console.log(
                "DELETE /account ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while deleting account."
            });
        }
    }
);

// ==================================================
// ADMIN TRANSACTIONS
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
                        ascending:
                            false
                    }
                );

            if (error) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to get transactions.",
                    error:
                        error.message
                });
            }

            return res.json(
                (transactions || []).map(
                    transaction => ({

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
                    })
                )
            );

        } catch (error) {

            console.log(
                "Admin transactions error:",
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
// SUPABASE TEST
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
                data
            });

        } catch (error) {

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
    "/health",
    (req, res) => {

        return res.json({
            success: true,
            message:
                "Atal Library backend is running successfully."
        });
    }
);

// ==================================================
// ROOT
// ==================================================

app.get(
    "/",
    (req, res) => {

        return res.status(200).send(
            "Atal Library backend is running successfully."
        );
    }
);

// ==================================================
// UNKNOWN API ROUTE
// ==================================================

app.use(
    (req, res) => {

        console.log(
            "UNKNOWN API ROUTE:",
            req.method,
            req.originalUrl
        );

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
    (
        error,
        req,
        res,
        next
    ) => {

        console.log(
            "GLOBAL SERVER ERROR:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        return res.status(500).json({
            success: false,
            message:
                "Internal server error."
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
            "Backend is ready."
        );

        console.log(
            "Attendance routes are enabled."
        );

        console.log(
            "Account delete route is enabled."
        );
    }
);