/* =====================================================
   ATAL LIBRARY - JAVASCRIPT
   Supabase Backend Version
===================================================== */

const API_URL = "https://atal-library-backend.onrender.com";


/* =====================================================
   USER FUNCTIONS
===================================================== */

function getSavedUser() {

    const savedUser = localStorage.getItem("libraryUser");

    if (!savedUser) {
        return null;
    }

    try {
        return JSON.parse(savedUser);
    }

    catch (error) {
        console.error("User data error:", error);
        return null;
    }
}

// ==================================================
// MY RENTALS
// ==================================================

function updateMyRentalVisibility() {

    const myRentalNavLink =
        document.getElementById("myRentalNavLink");

    const myRentalsSection =
        document.getElementById("my-rentals");

    const user =
        getSavedUser();


    if (
        user &&
        user.email
    ) {

        if (myRentalNavLink) {

            myRentalNavLink.style.display =
                "inline-block";

        }

        if (myRentalsSection) {

            myRentalsSection.style.display =
                "block";

        }

        loadMyRentals();

    }

    else {

        if (myRentalNavLink) {

            myRentalNavLink.style.display =
                "none";

        }

        if (myRentalsSection) {

            myRentalsSection.style.display =
                "none";

        }

    }

}


// ==================================================
// LOAD MY RENTALS
// ==================================================

async function loadMyRentals() {

    const container =
        document.getElementById(
            "myRentalsContainer"
        );

    const message =
        document.getElementById(
            "myRentalsMessage"
        );

    const user =
        getSavedUser();


    if (!container) {

        return;

    }


    if (
        !user ||
        !user.email
    ) {

        container.innerHTML = "";

        if (message) {

            message.textContent =
                "Please login to see your rented books.";

        }

        return;

    }


    try {

        if (message) {

            message.style.display =
                "block";

            message.textContent =
                "Loading your rented books...";

        }


        const response =
            await fetch(
                `${API_URL}/my-rentals?email=${encodeURIComponent(user.email)}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to load your rentals."
            );

        }


        // ------------------------------------------
        // SAFE RESPONSE HANDLING
        // ------------------------------------------

        const rentals =
            Array.isArray(data)
                ? data
                : Array.isArray(data.rentals)
                    ? data.rentals
                    : Array.isArray(data.data)
                        ? data.data
                        : [];


        // ------------------------------------------
        // NO RENTALS
        // ------------------------------------------

        if (
            rentals.length === 0
        ) {

            container.innerHTML = `

                <div
                    style="
                        width:100%;
                        text-align:center;
                        padding:40px 20px;
                    "
                >

                    <div
                        style="
                            font-size:50px;
                            margin-bottom:15px;
                        "
                    >
                        📚
                    </div>

                    <h3>
                        No Active Rentals
                    </h3>

                    <p
                        style="
                            color:#64748b;
                        "
                    >
                        You have not rented any book currently.
                    </p>

                </div>

            `;

            return;

        }


        // ------------------------------------------
        // RENDER RENTALS
        // ------------------------------------------

        container.innerHTML = rentals
            .map(
                function (rental) {

                    const image =
                        rental.image ||
                        "https://via.placeholder.com/300x400?text=Book";


                    const rentDate =
                        rental.rentDate
                            ? new Date(
                                rental.rentDate
                            ).toLocaleString()
                            : "N/A";


                    return `

                        <div
                            class="book-card"
                            style="
                                position:relative;
                            "
                        >

                            <img
                                src="${image}"
                                alt="${rental.book || "Book"}"
                                style="
                                    width:100%;
                                    height:250px;
                                    object-fit:cover;
                                "
                            >


                            <div
                                class="book-card-content"
                            >

                                <span
                                    style="
                                        display:inline-block;
                                        background:#fee2e2;
                                        color:#b91c1c;
                                        padding:5px 10px;
                                        border-radius:20px;
                                        font-size:12px;
                                        font-weight:bold;
                                        margin-bottom:10px;
                                    "
                                >
                                    📕 RENTED BY YOU
                                </span>


                                <h3>
                                    ${rental.book || "Unknown Book"}
                                </h3>


                                <p>
                                    <strong>
                                        Author:
                                    </strong>
                                    ${rental.author || "Unknown"}
                                </p>


                                ${
                                    rental.category
                                        ? `
                                            <p>
                                                <strong>
                                                    Category:
                                                </strong>
                                                ${rental.category}
                                            </p>
                                        `
                                        : ""
                                }


                                ${
                                    rental.year
                                        ? `
                                            <p>
                                                <strong>
                                                    Year:
                                                </strong>
                                                ${rental.year}
                                            </p>
                                        `
                                        : ""
                                }


                                <p
                                    style="
                                        font-size:13px;
                                        color:#64748b;
                                    "
                                >
                                    <strong>
                                        Rented:
                                    </strong>
                                    ${rentDate}
                                </p>


                                <button
                                    type="button"
                                    class="submit-btn my-rental-submit-btn"
                                    data-book-id="${rental.bookId || ""}"
                                    data-book="${encodeURIComponent(rental.book || "")}"
                                    data-author="${encodeURIComponent(rental.author || "")}"
                                    style="
                                        width:100%;
                                        margin-top:12px;
                                    "
                                >
                                    ↩️ Submit Book
                                </button>

                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    }

    catch (error) {

        console.error(
            "My Rentals Error:",
            error
        );


        container.innerHTML = `

            <div
                style="
                    width:100%;
                    text-align:center;
                    padding:40px 20px;
                "
            >

                <h3>
                    Unable to Load Rentals
                </h3>

                <p
                    style="
                        color:#64748b;
                    "
                >
                    ${error.message}
                </p>

                <button
                    type="button"
                    onclick="loadMyRentals()"
                    style="
                        padding:10px 18px;
                        border:none;
                        border-radius:8px;
                        background:#2563eb;
                        color:white;
                        cursor:pointer;
                        font-weight:bold;
                    "
                >
                    🔄 Try Again
                </button>

            </div>

        `;

    }

}


// ==================================================
// SUBMIT BOOK FROM MY RENTALS
// ==================================================

async function submitMyRental(
    bookId,
    bookName,
    author
) {

    const user =
        getSavedUser();


    if (
        !user ||
        !user.email
    ) {

        alert(
            "Please login first."
        );

        return;

    }


    if (!bookId) {

        alert(
            "Book information is missing. Please refresh the page and try again."
        );

        return;

    }


    const confirmed =
        confirm(
            `Do you want to submit "${bookName}"?`
        );


    if (!confirmed) {

        return;

    }


    try {

        const response =
            await fetch(
                `${API_URL}/submit`,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            name:
                                user.name,

                            email:
                                user.email,

                            book:
                                bookName,

                            author:
                                author,

                            bookId:
                                Number(bookId)

                        })

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to submit book."
            );

        }


        alert(
            data.message ||
            "Book submitted successfully."
        );


        // Refresh books
        await loadBooksFromBackend();


        // Refresh My Rental
        await loadMyRentals();


    }

    catch (error) {

        console.error(
            "Submit My Rental Error:",
            error
        );


        alert(
            error.message ||
            "Unable to submit book."
        );

    }

}


function saveUser(user) {

    if (user) {
        localStorage.setItem(
            "libraryUser",
            JSON.stringify(user)
        );
    }
}


function getAttendanceUser() {

    const user = getSavedUser();

    if (user && user.email) {
        return user;
    }

    return null;
}


/* =====================================================
   ATTENDANCE VISIBILITY
===================================================== */

function updateAttendanceVisibility() {

    const user = getAttendanceUser();

    const attendanceSection =
        document.getElementById("attendance");

    const attendanceNavLink =
        document.getElementById("attendanceNavLink");


    const isLoggedIn =
        !!(user && user.email);


    if (attendanceSection) {

        attendanceSection.style.display =
            isLoggedIn ? "block" : "none";

    }


    if (attendanceNavLink) {

        attendanceNavLink.style.display =
            isLoggedIn ? "inline-block" : "none";

    }

}


/* =====================================================
   PROFILE PHOTO
===================================================== */

function getProfilePhoto(user) {

    return (
        user?.profile_photo ||
        user?.ProfilePhoto ||
        user?.profilePhoto ||
        ""
    );

}


function renderUserGreeting(element, name, photoUrl) {

    if (!element) {
        return;
    }


    element.innerHTML = "";


    const wrapper =
        document.createElement("span");


    wrapper.style.display =
        "inline-flex";

    wrapper.style.alignItems =
        "center";

    wrapper.style.gap =
        "8px";


    if (photoUrl) {

        const img =
            document.createElement("img");


        img.src = photoUrl;

        img.alt = "Profile Photo";

        img.width = 35;
        img.height = 35;


        img.style.width =
            "35px";

        img.style.height =
            "35px";

        img.style.borderRadius =
            "50%";

        img.style.objectFit =
            "cover";

        img.style.border =
            "2px solid #ffffff";

        img.style.display =
            "block";

        img.style.cursor =
            "pointer";


        img.title =
            "Click to change profile photo";


        img.onerror = function () {

            console.error(
                "Profile photo could not be loaded:",
                photoUrl
            );

            img.style.display = "none";

        };


        wrapper.appendChild(img);

    }


    const text =
        document.createElement("span");


    text.textContent =
        "Hello, " +
        name +
        " 👋";


    wrapper.appendChild(text);


    element.appendChild(wrapper);


    element.style.display =
        "inline-block";

}


/* =====================================================
   DOM LOADED
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        // ==================================================
// MY RENTAL NAVIGATION
// ==================================================

const myRentalNavLink =
    document.getElementById(
        "myRentalNavLink"
    );


if (myRentalNavLink) {

    myRentalNavLink.addEventListener(
        "click",
        function () {

            const user =
                getSavedUser();


            if (
                !user ||
                !user.email
            ) {

                this.style.display =
                    "none";

                return;

            }


            const myRentalsSection =
                document.getElementById(
                    "my-rentals"
                );


            if (myRentalsSection) {

                myRentalsSection.style.display =
                    "block";


                myRentalsSection.scrollIntoView({

                    behavior:
                        "smooth"

                });

            }


            loadMyRentals();

        }
    );

}


// ==================================================
// MY RENTAL SUBMIT BUTTON
// ==================================================

const myRentalsContainer =
    document.getElementById(
        "myRentalsContainer"
    );


if (myRentalsContainer) {

    myRentalsContainer.addEventListener(
        "click",
        function (event) {

            const submitButton =
                event.target.closest(
                    ".my-rental-submit-btn"
                );


            if (!submitButton) {

                return;

            }


            const bookId =
                submitButton.dataset.bookId;


            const bookName =
                decodeURIComponent(
                    submitButton.dataset.book || ""
                );


            const author =
                decodeURIComponent(
                    submitButton.dataset.author || ""
                );


            submitMyRental(
                bookId,
                bookName,
                author
            );

        }
    );

}

        /* =================================================
           NAVBAR
        ================================================= */

        const menuBtn =
            document.getElementById("menuBtn");


        const mainMenu =
            document.getElementById("mainMenu");


        if (menuBtn && mainMenu) {

            menuBtn.onclick =
                function () {

                    mainMenu.classList.toggle(
                        "active"
                    );

                };


            const menuLinks =
                document.querySelectorAll(
                    ".menu a"
                );


            menuLinks.forEach(
                function (link) {

                    link.onclick =
                        function () {

                            mainMenu.classList.remove(
                                "active"
                            );

                        };

                }
            );

        }


        /* =================================================
           AUTH ELEMENTS
        ================================================= */

        const loginBtn =
            document.getElementById("loginBtn");


        const registerBtn =
            document.getElementById("registerBtn");


        const logoutBtn =
            document.getElementById("logoutBtn");


        const userGreeting =
            document.getElementById("userGreeting");


        const mobileLoginBtn =
            document.getElementById(
                "mobileLoginBtn"
            );


        const mobileRegisterBtn =
            document.getElementById(
                "mobileRegisterBtn"
            );


        const mobileLogoutBtn =
            document.getElementById(
                "mobileLogoutBtn"
            );


        const mobileUserGreeting =
            document.getElementById(
                "mobileUserGreeting"
            );


        /* =================================================
           AUTH MODALS
        ================================================= */

        const loginModal =
            document.getElementById(
                "loginModal"
            );


        const registerModal =
            document.getElementById(
                "registerModal"
            );


        const forgotPasswordModal =
            document.getElementById(
                "forgotPasswordModal"
            );


        /* =================================================
           CLOSE ALL AUTH MODALS
        ================================================= */

        function closeAllAuthModals() {

            if (loginModal) {

                loginModal.style.display =
                    "none";

            }


            if (registerModal) {

                registerModal.style.display =
                    "none";

            }


            if (forgotPasswordModal) {

                forgotPasswordModal.style.display =
                    "none";


                forgotPasswordModal.classList.remove(
                    "show"
                );

            }

        }


        /* =================================================
           OPEN LOGIN
        ================================================= */

        function openLogin() {

            closeAllAuthModals();


            if (loginModal) {

                loginModal.style.display =
                    "flex";

            }

        }


        /* =================================================
           OPEN REGISTER
        ================================================= */

        function openRegister() {

            closeAllAuthModals();


            if (registerModal) {

                registerModal.style.display =
                    "flex";

            }

        }


        /* =================================================
           OPEN FORGOT PASSWORD
        ================================================= */

        function openForgotPassword() {

            closeAllAuthModals();


            if (forgotPasswordModal) {

                forgotPasswordModal.style.display =
                    "flex";


                forgotPasswordModal.classList.add(
                    "show"
                );

            }

        }


        /* =================================================
           LOGIN BUTTON
        ================================================= */

        if (loginBtn) {

            loginBtn.onclick =
                function () {

                    openLogin();

                };

        }


        /* =================================================
           REGISTER BUTTON
        ================================================= */

        if (registerBtn) {

            registerBtn.onclick =
                function () {

                    openRegister();

                };

        }


        /* =================================================
           MOBILE LOGIN
        ================================================= */

        if (mobileLoginBtn) {

            mobileLoginBtn.onclick =
                function () {

                    openLogin();


                    if (mainMenu) {

                        mainMenu.classList.remove(
                            "active"
                        );

                    }

                };

        }


        /* =================================================
           MOBILE REGISTER
        ================================================= */

        if (mobileRegisterBtn) {

            mobileRegisterBtn.onclick =
                function () {

                    openRegister();


                    if (mainMenu) {

                        mainMenu.classList.remove(
                            "active"
                        );

                    }

                };

        }


        /* =================================================
           CLOSE BUTTONS
        ================================================= */

        const loginClose =
            document.getElementById(
                "loginClose"
            );


        const registerClose =
            document.getElementById(
                "registerClose"
            );


        const forgotPasswordClose =
            document.getElementById(
                "forgotPasswordClose"
            );


        if (loginClose) {

            loginClose.onclick =
                function () {

                    if (loginModal) {

                        loginModal.style.display =
                            "none";

                    }

                };

        }


        if (registerClose) {

            registerClose.onclick =
                function () {

                    if (registerModal) {

                        registerModal.style.display =
                            "none";

                    }

                };

        }


        if (forgotPasswordClose) {

            forgotPasswordClose.onclick =
                function () {

                    if (forgotPasswordModal) {

                        forgotPasswordModal.style.display =
                            "none";


                        forgotPasswordModal.classList.remove(
                            "show"
                        );

                    }

                };

        }


        /* =================================================
           SWITCH LOGIN / REGISTER
        ================================================= */

        const openRegisterBtn =
            document.getElementById(
                "openRegister"
            );


        const openLoginBtn =
            document.getElementById(
                "openLogin"
            );


        if (openRegisterBtn) {

            openRegisterBtn.onclick =
                function () {

                    openRegister();

                };

        }


        if (openLoginBtn) {

            openLoginBtn.onclick =
                function () {

                    openLogin();

                };

        }


        /* =================================================
           FORGOT PASSWORD BUTTON
        ================================================= */

        const forgotPasswordBtn =
            document.getElementById(
                "forgotPasswordBtn"
            );


        if (forgotPasswordBtn) {

            forgotPasswordBtn.onclick =
                function (event) {

                    event.preventDefault();

                    event.stopPropagation();

                    openForgotPassword();

                };

        }


        /* =================================================
           BACK TO LOGIN
        ================================================= */

        const backToLogin =
            document.getElementById(
                "backToLogin"
            );


        if (backToLogin) {

            backToLogin.onclick =
                function () {

                    if (forgotPasswordModal) {

                        forgotPasswordModal.style.display =
                            "none";


                        forgotPasswordModal.classList.remove(
                            "show"
                        );

                    }


                    openLogin();

                };

        }


        /* =================================================
           USER UI
        ================================================= */

        function updateUserUI() {

            const user =
                getSavedUser();


            /*
               IMPORTANT:
               Attendance and login now use libraryUser.
               loggedUser is kept only for old book features.
            */

            const isLoggedIn =
                !!(user && user.email);

            updateMyRentalVisibility();

            updateAttendanceVisibility();


            if (isLoggedIn) {


                /* ==============================
                   DESKTOP
                ============================== */

                const profilePhoto =
                    getProfilePhoto(user);


                renderUserGreeting(
                    userGreeting,
                    user.name || "User",
                    profilePhoto
                );


                if (userGreeting) {

                    userGreeting.style.cursor =
                        "pointer";


                    userGreeting.title =
                        "Click to change profile photo";


                    userGreeting.onclick =
                        openProfilePhotoPicker;

                }


                if (loginBtn) {

                    loginBtn.style.display =
                        "none";

                }


                if (registerBtn) {

                    registerBtn.style.display =
                        "none";

                }


                if (logoutBtn) {

                    logoutBtn.style.display =
                        "inline-block";

                }


                /* ==============================
                   MOBILE
                ============================== */

                renderUserGreeting(
                    mobileUserGreeting,
                    user.name || "User",
                    profilePhoto
                );


                if (mobileUserGreeting) {

                    mobileUserGreeting.style.cursor =
                        "pointer";


                    mobileUserGreeting.title =
                        "Click to change profile photo";


                    mobileUserGreeting.onclick =
                        openProfilePhotoPicker;

                }


                if (mobileLoginBtn) {

                    mobileLoginBtn.style.display =
                        "none";

                }


                if (mobileRegisterBtn) {

                    mobileRegisterBtn.style.display =
                        "none";

                }


                if (mobileLogoutBtn) {

                    mobileLogoutBtn.style.display =
                        "inline-block";

                }


                /* ==============================
                   ATTENDANCE
                ============================== */

                loadAttendanceStatus();

            }


            else {


                /* ==============================
                   DESKTOP
                ============================== */

                if (userGreeting) {

                    userGreeting.innerHTML = "";

                    userGreeting.style.display =
                        "none";

                    userGreeting.onclick =
                        null;

                }


                /* ==============================
                   MOBILE
                ============================== */

                if (mobileUserGreeting) {

                    mobileUserGreeting.innerHTML =
                        "";

                    mobileUserGreeting.style.display =
                        "none";

                    mobileUserGreeting.onclick =
                        null;

                }


                if (loginBtn) {

                    loginBtn.style.display =
                        "inline-block";

                }


                if (registerBtn) {

                    registerBtn.style.display =
                        "inline-block";

                }


                if (logoutBtn) {

                    logoutBtn.style.display =
                        "none";

                }


                if (mobileLoginBtn) {

                    mobileLoginBtn.style.display =
                        "inline-block";

                }


                if (mobileRegisterBtn) {

                    mobileRegisterBtn.style.display =
                        "inline-block";

                }


                if (mobileLogoutBtn) {

                    mobileLogoutBtn.style.display =
                        "none";

                }


                updateAttendanceUI(
                    false,
                    null
                );

            }

        }


        /* =================================================
           CHANGE PROFILE PHOTO
        ================================================= */

        async function changeProfilePhoto(file) {

            const user =
                getSavedUser();


            if (!user || !user.email) {

                alert(
                    "Please login first."
                );

                return;

            }


            if (!file) {

                return;

            }


            const allowedTypes = [

                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif"

            ];


            if (!allowedTypes.includes(file.type)) {

                alert(
                    "Please select JPG, PNG, WEBP or GIF image."
                );

                return;

            }


            if (
                file.size >
                5 * 1024 * 1024
            ) {

                alert(
                    "Profile photo must be 5 MB or smaller."
                );

                return;

            }


            try {

                const formData =
                    new FormData();


                formData.append(
                    "email",
                    user.email
                );


                formData.append(
                    "profile_photo",
                    file
                );


                const response =
                    await fetch(
                        `${API_URL}/profile-photo`,
                        {
                            method: "POST",
                            body: formData
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    alert(
                        data.message ||
                        "Profile photo update failed."
                    );

                    return;

                }


                const returnedUser =
                    data.user ||
                    data.profile ||
                    data;


                const newPhoto =
                    data.profile_photo ||
                    data.ProfilePhoto ||
                    data.profilePhoto ||
                    returnedUser?.profile_photo ||
                    returnedUser?.ProfilePhoto ||
                    returnedUser?.profilePhoto ||
                    "";


                if (!newPhoto) {

                    alert(
                        "Photo uploaded, but photo URL was not returned."
                    );

                    return;

                }


                user.profile_photo =
                    newPhoto;


                saveUser(user);


                updateUserUI();


                alert(
                    "Profile photo updated successfully! 📷"
                );

            }


            catch (error) {

                console.error(
                    "Profile Photo Error:",
                    error
                );


                alert(
                    "Unable to connect to backend server."
                );

            }

        }


        function openProfilePhotoPicker() {

            const user =
                getSavedUser();


            if (!user || !user.email) {

                alert(
                    "Please login first."
                );

                return;

            }


            const input =
                document.createElement(
                    "input"
                );


            input.type = "file";


            input.accept =
                "image/jpeg,image/png,image/webp,image/gif";


            input.style.display =
                "none";


            document.body.appendChild(input);


            input.onchange =
                async function () {

                    const file =
                        input.files &&
                        input.files.length > 0
                            ? input.files[0]
                            : null;


                    if (file) {

                        await changeProfilePhoto(
                            file
                        );

                    }


                    input.remove();

                };


            input.click();

        }


        /* =================================================
           REFRESH PROFILE
        ================================================= */

        async function refreshProfileFromBackend() {

            const user =
                getSavedUser();


            if (
                !user ||
                !user.email
            ) {

                return;

            }


            try {

                const response =
                    await fetch(
                        `${API_URL}/profile?email=${encodeURIComponent(user.email)}`
                    );


                if (!response.ok) {

                    return;

                }


                const data =
                    await response.json();


                const serverUser =
                    data.user ||
                    data.profile ||
                    data;


                if (!serverUser) {

                    return;

                }


                user.id =
                    serverUser.id ||
                    serverUser.ID ||
                    user.id ||
                    "";


                user.name =
                    serverUser.name ||
                    serverUser.Name ||
                    user.name ||
                    "User";


                user.email =
                    serverUser.email ||
                    serverUser.Email ||
                    user.email;


                user.phone =
                    serverUser.phone ||
                    serverUser.Phone ||
                    user.phone ||
                    "";


                const latestPhoto =
                    serverUser.profile_photo ||
                    serverUser.ProfilePhoto ||
                    serverUser.profilePhoto ||
                    data.profile_photo ||
                    data.ProfilePhoto ||
                    "";


                if (latestPhoto) {

                    user.profile_photo =
                        latestPhoto;

                }


                saveUser(user);


                updateUserUI();

            }


            catch (error) {

                console.log(
                    "Profile refresh skipped:",
                    error
                );

            }

        }


        /* =================================================
           LOGOUT
        ================================================= */

        function logoutUser() {

            localStorage.removeItem("loggedUser");
            localStorage.removeItem("libraryUser");

            updateUserUI();


            updateAttendanceVisibility();


            if (mainMenu) {

                mainMenu.classList.remove(
                    "active"
                );

            }


            alert(
                "You have been logged out."
            );

        }


        if (logoutBtn) {

            logoutBtn.onclick =
                logoutUser;

        }


        if (mobileLogoutBtn) {

            mobileLogoutBtn.onclick =
                logoutUser;

        }


        /* =================================================
           REGISTER + EMAIL OTP
        ================================================= */

        const registerForm =
            document.getElementById(
                "registerForm"
            );


        const sendEmailOtp =
            document.getElementById(
                "sendEmailOtp"
            );


        const verifyEmailOtp =
            document.getElementById(
                "verifyEmailOtp"
            );


        const emailOtpStatus =
            document.getElementById(
                "emailOtpStatus"
            );


        const emailOtpInput =
            document.getElementById(
                "emailOtp"
            );


        let emailVerified = false;


        /* =================================================
           SEND EMAIL OTP
        ================================================= */

        if (sendEmailOtp) {

            sendEmailOtp.onclick =
                async function () {

                    const emailInput =
                        document.getElementById(
                            "registerEmail"
                        );


                    const email =
                        emailInput
                            ? emailInput.value
                                .trim()
                                .toLowerCase()
                            : "";


                    if (!email) {

                        alert(
                            "Please enter your email first."
                        );

                        return;

                    }


                    if (
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                            email
                        )
                    ) {

                        alert(
                            "Please enter a valid email address."
                        );

                        return;

                    }


                    try {

                        sendEmailOtp.disabled =
                            true;


                        sendEmailOtp.innerText =
                            "Sending...";


                        const response =
                            await fetch(
                                `${API_URL}/send-email-otp`,
                                {

                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({
                                        email: email
                                    })

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            alert(
                                data.message ||
                                "Unable to send OTP."
                            );

                            return;

                        }


                        emailVerified =
                            false;


                        if (emailOtpStatus) {

                            emailOtpStatus.innerText =
                                "OTP sent to your email. Please check your Gmail.";


                            emailOtpStatus.style.color =
                                "#2563eb";

                        }


                        alert(
                            "OTP sent successfully. Check your email."
                        );

                    }


                    catch (error) {

                        console.error(
                            "Send OTP Error:",
                            error
                        );


                        alert(
                            "Unable to connect to backend server."
                        );

                    }


                    finally {

                        sendEmailOtp.disabled =
                            false;


                        sendEmailOtp.innerText =
                            "Send OTP";

                    }

                };

        }


        /* =================================================
           VERIFY OTP
        ================================================= */

        if (verifyEmailOtp) {

            verifyEmailOtp.onclick =
                async function () {

                    const emailInput =
                        document.getElementById(
                            "registerEmail"
                        );


                    const email =
                        emailInput
                            ? emailInput.value
                                .trim()
                                .toLowerCase()
                            : "";


                    const otp =
                        emailOtpInput
                            ? emailOtpInput.value.trim()
                            : "";


                    if (!email) {

                        alert(
                            "Please enter your email."
                        );

                        return;

                    }


                    if (!otp) {

                        alert(
                            "Please enter the OTP."
                        );

                        return;

                    }


                    if (!/^\d{6}$/.test(otp)) {

                        alert(
                            "Please enter a valid 6-digit OTP."
                        );

                        return;

                    }


                    try {

                        verifyEmailOtp.disabled =
                            true;


                        verifyEmailOtp.innerText =
                            "Verifying...";


                        const response =
                            await fetch(
                                `${API_URL}/verify-email-otp`,
                                {

                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({

                                        email: email,

                                        otp: otp

                                    })

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            emailVerified =
                                false;


                            if (emailOtpStatus) {

                                emailOtpStatus.innerText =
                                    data.message ||
                                    "Invalid OTP.";


                                emailOtpStatus.style.color =
                                    "#dc2626";

                            }

                            return;

                        }


                        emailVerified =
                            true;


                        if (emailOtpStatus) {

                            emailOtpStatus.innerText =
                                "✓ Email verified successfully.";


                            emailOtpStatus.style.color =
                                "#16a34a";

                        }


                        alert(
                            "Email verified successfully!"
                        );


                        if (emailInput) {

                            emailInput.disabled =
                                true;

                        }


                        if (emailOtpInput) {

                            emailOtpInput.disabled =
                                true;

                        }


                        verifyEmailOtp.disabled =
                            true;


                        verifyEmailOtp.innerText =
                            "Verified ✓";

                    }


                    catch (error) {

                        console.error(
                            "Verify OTP Error:",
                            error
                        );


                        emailVerified =
                            false;


                        alert(
                            "Unable to connect to backend server."
                        );

                    }


                    finally {

                        if (!emailVerified) {

                            verifyEmailOtp.disabled =
                                false;


                            verifyEmailOtp.innerText =
                                "Verify";

                        }

                    }

                };

        }


        /* =================================================
           REGISTER ACCOUNT
        ================================================= */

        if (registerForm) {

            registerForm.onsubmit =
                async function (event) {

                    event.preventDefault();


                    const nameInput =
                        document.getElementById(
                            "registerName"
                        );


                    const emailInput =
                        document.getElementById(
                            "registerEmail"
                        );


                    const phoneInput =
                        document.getElementById(
                            "registerPhone"
                        );


                    const passwordInput =
                        document.getElementById(
                            "registerPassword"
                        );


                    const photoInput =
                        document.getElementById(
                            "registerPhoto"
                        );


                    const name =
                        nameInput
                            ? nameInput.value.trim()
                            : "";


                    const email =
                        emailInput
                            ? emailInput.value
                                .trim()
                                .toLowerCase()
                            : "";


                    const phone =
                        phoneInput
                            ? phoneInput.value.trim()
                            : "";


                    const password =
                        passwordInput
                            ? passwordInput.value
                            : "";


                    if (
                        !photoInput ||
                        !photoInput.files ||
                        photoInput.files.length === 0
                    ) {

                        alert(
                            "Please select your profile photo."
                        );

                        return;

                    }


                    const photo =
                        photoInput.files[0];


                    if (
                        photo.size >
                        5 * 1024 * 1024
                    ) {

                        alert(
                            "Profile photo must be 5 MB or smaller."
                        );

                        return;

                    }


                    const allowedTypes = [

                        "image/jpeg",
                        "image/png",
                        "image/webp",
                        "image/gif"

                    ];


                    if (!allowedTypes.includes(photo.type)) {

                        alert(
                            "Please select JPG, PNG, WEBP or GIF image."
                        );

                        return;

                    }


                    if (
                        !name ||
                        !email ||
                        !phone ||
                        !password
                    ) {

                        alert(
                            "Please fill all fields."
                        );

                        return;

                    }


                    if (
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                            email
                        )
                    ) {

                        alert(
                            "Please enter a valid email address."
                        );

                        return;

                    }


                    if (!emailVerified) {

                        alert(
                            "Please verify your email before creating your account."
                        );

                        return;

                    }


                    if (!/^\d{10}$/.test(phone)) {

                        alert(
                            "Please enter a valid 10-digit phone number."
                        );

                        return;

                    }


                    try {

                        const createAccountBtn =
                            document.getElementById(
                                "createAccountBtn"
                            );


                        if (createAccountBtn) {

                            createAccountBtn.disabled =
                                true;


                            createAccountBtn.innerText =
                                "Creating...";

                        }


                        const formData =
                            new FormData();


                        formData.append(
                            "name",
                            name
                        );


                        formData.append(
                            "email",
                            email
                        );


                        formData.append(
                            "phone",
                            phone
                        );


                        formData.append(
                            "password",
                            password
                        );


                        formData.append(
                            "profile_photo",
                            photo
                        );


                        const response =
                            await fetch(
                                `${API_URL}/register`,
                                {

                                    method: "POST",

                                    body: formData

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            alert(
                                data.message ||
                                "Registration failed."
                            );

                            return;

                        }


                        const user = {

                            id:
                                data.user?.id ||
                                "",

                            name:
                                data.user?.name ||
                                name,

                            email:
                                data.user?.email ||
                                email,

                            phone:
                                data.user?.phone ||
                                phone,

                            profile_photo:
                                data.user?.profile_photo ||
                                data.user?.ProfilePhoto ||
                                data.user?.profilePhoto ||
                                data.profile_photo ||
                                data.ProfilePhoto ||
                                ""

                        };


                        saveUser(user);


                        /*
                           Registration ke baad user
                           automatically logged in nahi hoga.
                           Sirf libraryUser saved rahega.
                        */

                        localStorage.removeItem(
                            "loggedUser"
                        );


                        updateAttendanceVisibility();


                        alert(
                            "Account created successfully! Please login."
                        );


                        registerForm.reset();


                        emailVerified =
                            false;


                        if (emailOtpStatus) {

                            emailOtpStatus.innerText =
                                "";

                        }


                        if (emailInput) {

                            emailInput.disabled =
                                false;

                        }


                        if (emailOtpInput) {

                            emailOtpInput.disabled =
                                false;

                        }


                        if (verifyEmailOtp) {

                            verifyEmailOtp.disabled =
                                false;


                            verifyEmailOtp.innerText =
                                "Verify";

                        }


                        if (registerModal) {

                            registerModal.style.display =
                                "none";

                        }


                        openLogin();

                    }


                    catch (error) {

                        console.error(
                            "Register Error:",
                            error
                        );


                        alert(
                            "Unable to connect to backend server."
                        );

                    }


                    finally {

                        const createAccountBtn =
                            document.getElementById(
                                "createAccountBtn"
                            );


                        if (createAccountBtn) {

                            createAccountBtn.disabled =
                                false;


                            createAccountBtn.innerText =
                                "Create Account";

                        }

                    }

                };

        }


        /* =================================================
           LOGIN
        ================================================= */

        const loginForm =
            document.getElementById(
                "loginForm"
            );


        if (loginForm) {

            loginForm.onsubmit =
                async function (event) {

                    event.preventDefault();


                    const emailInput =
                        document.getElementById(
                            "loginEmail"
                        );


                    const passwordInput =
                        document.getElementById(
                            "loginPassword"
                        );


                    const email =
                        emailInput
                            ? emailInput.value
                                .trim()
                                .toLowerCase()
                            : "";


                    const password =
                        passwordInput
                            ? passwordInput.value
                            : "";


                    if (!email || !password) {

                        alert(
                            "Please fill all fields."
                        );

                        return;

                    }


                    try {

                        const response =
                            await fetch(
                                `${API_URL}/login`,
                                {

                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({

                                        email: email,

                                        password: password

                                    })

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            alert(
                                data.message ||
                                "Login failed."
                            );

                            return;

                        }


                        /* =================================
                           SAVE LOGIN USER
                        ================================= */

                        const loggedUserData = {

                            id:
                                data.user?.id ||
                                "",

                            name:
                                data.user?.name ||
                                "",

                            email:
                                data.user?.email ||
                                email,

                            phone:
                                data.user?.phone ||
                                "",

                            profile_photo:
                                data.user?.profile_photo ||
                                data.user?.ProfilePhoto ||
                                data.user?.profilePhoto ||
                                ""

                        };


                        /*
                           Save both for compatibility
                           with existing book functions.
                        */

                        localStorage.setItem(
                            "loggedUser",
                            loggedUserData.name
                        );


                        localStorage.setItem(
                            "libraryUser",
                            JSON.stringify(
                                loggedUserData
                            )
                        );


                        /* =================================
                           UPDATE USER UI
                        ================================= */

                        updateUserUI();


                        updateAttendanceVisibility();


                        /* =================================
                           CLOSE LOGIN
                        ================================= */

                        loginForm.reset();


                        if (loginModal) {

                            loginModal.style.display =
                                "none";

                        }


                        alert(
                            "Login successful! Welcome " +
                            loggedUserData.name
                        );


                        /* =================================
                           ATTENDANCE STATUS
                        ================================= */

                        await loadAttendanceStatus();


                        updateAttendanceVisibility();

                    }


                    catch (error) {

                        console.error(
                            "Login Error:",
                            error
                        );


                        alert(
                            "Unable to connect to backend server."
                        );

                    }

                };

        }


        /* =================================================
           FORGOT PASSWORD
        ================================================= */

        const forgotPasswordForm =
            document.getElementById(
                "forgotPasswordForm"
            );


        if (forgotPasswordForm) {

            forgotPasswordForm.onsubmit =
                async function (event) {

                    event.preventDefault();


                    const emailInput =
                        document.getElementById(
                            "forgotEmail"
                        );


                    const phoneInput =
                        document.getElementById(
                            "forgotPhone"
                        );


                    const newPasswordInput =
                        document.getElementById(
                            "forgotNewPassword"
                        );


                    const confirmPasswordInput =
                        document.getElementById(
                            "forgotConfirmPassword"
                        );


                    const email =
                        emailInput
                            ? emailInput.value
                                .trim()
                                .toLowerCase()
                            : "";


                    const phone =
                        phoneInput
                            ? phoneInput.value.trim()
                            : "";


                    const newPassword =
                        newPasswordInput
                            ? newPasswordInput.value
                            : "";


                    const confirmPassword =
                        confirmPasswordInput
                            ? confirmPasswordInput.value
                            : "";


                    if (
                        !email ||
                        !phone ||
                        !newPassword ||
                        !confirmPassword
                    ) {

                        alert(
                            "Please fill all fields."
                        );

                        return;

                    }


                    if (!/^\d{10}$/.test(phone)) {

                        alert(
                            "Please enter a valid 10-digit phone number."
                        );

                        return;

                    }


                    if (
                        newPassword !==
                        confirmPassword
                    ) {

                        alert(
                            "New password and confirm password do not match."
                        );

                        return;

                    }


                    try {

                        const response =
                            await fetch(
                                `${API_URL}/forgot-password`,
                                {

                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({

                                        email: email,

                                        phone: phone,

                                        newPassword:
                                            newPassword

                                    })

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            alert(
                                data.message ||
                                "Password reset failed."
                            );

                            return;

                        }


                        alert(
                            "Password changed successfully! Please login."
                        );


                        forgotPasswordForm.reset();


                        if (forgotPasswordModal) {

                            forgotPasswordModal.style.display =
                                "none";


                            forgotPasswordModal.classList.remove(
                                "show"
                            );

                        }


                        openLogin();

                    }


                    catch (error) {

                        console.error(
                            "Forgot Password Error:",
                            error
                        );


                        alert(
                            "Unable to connect to backend server."
                        );

                    }

                };

        }


        /* =================================================
           BOOK DATA
        ================================================= */

        let books = [];

        let selectedBookId = null;


        const bookContainer =
            document.getElementById(
                "bookContainer"
            );


        /* =====================================================
           BOOK PAGINATION
        ===================================================== */

        const BOOKS_PER_PAGE = 12;

        let currentPage = 1;

        let currentBookList = [];


        /* =====================================================
           CREATE PAGINATION UI
        ===================================================== */

        let pagination =
            document.getElementById(
                "pagination"
            );


        /*
           Agar index.html me pagination HTML
           already nahi hai to JavaScript automatically
           create kar dega.
        */

        if (!pagination && bookContainer) {

            pagination =
                document.createElement("div");

            pagination.id =
                "pagination";

            pagination.style.display =
                "none";

            pagination.style.justifyContent =
                "center";

            pagination.style.alignItems =
                "center";

            pagination.style.gap =
                "10px";

            pagination.style.marginTop =
                "30px";

            pagination.style.marginBottom =
                "30px";

            pagination.style.flexWrap =
                "wrap";


            const prevButton =
                document.createElement("button");

            prevButton.id =
                "prevPageBtn";

            prevButton.type =
                "button";

            prevButton.innerText =
                "← Previous";


            prevButton.style.padding =
                "10px 18px";

            prevButton.style.border =
                "none";

            prevButton.style.borderRadius =
                "8px";

            prevButton.style.background =
                "#2563eb";

            prevButton.style.color =
                "white";

            prevButton.style.fontWeight =
                "bold";

            prevButton.style.cursor =
                "pointer";


            const pageNumbers =
                document.createElement("div");

            pageNumbers.id =
                "pageNumbers";

            pageNumbers.style.display =
                "flex";

            pageNumbers.style.gap =
                "6px";

            pageNumbers.style.flexWrap =
                "wrap";

            pageNumbers.style.justifyContent =
                "center";


            const nextButton =
                document.createElement("button");

            nextButton.id =
                "nextPageBtn";

            nextButton.type =
                "button";

            nextButton.innerText =
                "Next →";


            nextButton.style.padding =
                "10px 18px";

            nextButton.style.border =
                "none";

            nextButton.style.borderRadius =
                "8px";

            nextButton.style.background =
                "#2563eb";

            nextButton.style.color =
                "white";

            nextButton.style.fontWeight =
                "bold";

            nextButton.style.cursor =
                "pointer";


            pagination.appendChild(
                prevButton
            );

            pagination.appendChild(
                pageNumbers
            );

            pagination.appendChild(
                nextButton
            );


            bookContainer.insertAdjacentElement(
                "afterend",
                pagination
            );

        }


        /* =====================================================
           PAGINATION FUNCTIONS
        ===================================================== */

        function updatePagination() {

            if (!pagination) {
                return;
            }


            const prevPageBtn =
                document.getElementById(
                    "prevPageBtn"
                );


            const nextPageBtn =
                document.getElementById(
                    "nextPageBtn"
                );


            const pageNumbers =
                document.getElementById(
                    "pageNumbers"
                );


            const totalPages =
                Math.ceil(
                    currentBookList.length /
                    BOOKS_PER_PAGE
                );


            /*
               No pagination needed when
               there is only one page.
            */

            if (
                currentBookList.length === 0 ||
                totalPages <= 1
            ) {

                pagination.style.display =
                    "none";

                if (pageNumbers) {
                    pageNumbers.innerHTML = "";
                }

                return;

            }


            pagination.style.display =
                "flex";


            if (pageNumbers) {

                pageNumbers.innerHTML = "";


                for (
                    let page = 1;
                    page <= totalPages;
                    page++
                ) {

                    const pageButton =
                        document.createElement(
                            "button"
                        );


                    pageButton.type =
                        "button";


                    pageButton.innerText =
                        page;


                    pageButton.style.padding =
                        "10px 14px";

                    pageButton.style.border =
                        "none";

                    pageButton.style.borderRadius =
                        "8px";

                    pageButton.style.cursor =
                        "pointer";

                    pageButton.style.fontWeight =
                        "bold";


                    if (page === currentPage) {

                        pageButton.style.background =
                            "#1d4ed8";

                        pageButton.style.color =
                            "white";

                    }

                    else {

                        pageButton.style.background =
                            "#e2e8f0";

                        pageButton.style.color =
                            "#1e293b";

                    }


                    pageButton.onclick =
                        function () {

                            currentPage =
                                page;

                            displayCurrentPage();

                            window.scrollTo({

                                top:
                                    bookContainer
                                        ? bookContainer.offsetTop - 100
                                        : 0,

                                behavior:
                                    "smooth"

                            });

                        };


                    pageNumbers.appendChild(
                        pageButton
                    );

                }

            }


            if (prevPageBtn) {

                prevPageBtn.disabled =
                    currentPage <= 1;


                prevPageBtn.style.opacity =
                    currentPage <= 1
                        ? "0.5"
                        : "1";


                prevPageBtn.style.cursor =
                    currentPage <= 1
                        ? "not-allowed"
                        : "pointer";

            }


            if (nextPageBtn) {

                nextPageBtn.disabled =
                    currentPage >= totalPages;


                nextPageBtn.style.opacity =
                    currentPage >= totalPages
                        ? "0.5"
                        : "1";


                nextPageBtn.style.cursor =
                    currentPage >= totalPages
                        ? "not-allowed"
                        : "pointer";

            }

        }


        /* =====================================================
           PREVIOUS PAGE
        ===================================================== */

        const previousPageButton =
            document.getElementById(
                "prevPageBtn"
            );


        if (previousPageButton) {

            previousPageButton.onclick =
                function () {

                    if (currentPage > 1) {

                        currentPage--;

                        displayCurrentPage();

                        window.scrollTo({

                            top:
                                bookContainer
                                    ? bookContainer.offsetTop - 100
                                    : 0,

                            behavior:
                                "smooth"

                        });

                    }

                };

        }


        /* =====================================================
           NEXT PAGE
        ===================================================== */

        const nextPageButton =
            document.getElementById(
                "nextPageBtn"
            );


        if (nextPageButton) {

            nextPageButton.onclick =
                function () {

                    const totalPages =
                        Math.ceil(
                            currentBookList.length /
                            BOOKS_PER_PAGE
                        );


                    if (
                        currentPage <
                        totalPages
                    ) {

                        currentPage++;

                        displayCurrentPage();

                        window.scrollTo({

                            top:
                                bookContainer
                                    ? bookContainer.offsetTop - 100
                                    : 0,

                            behavior:
                                "smooth"

                        });

                    }

                };

        }


        /* =====================================================
           ATAL LIBRARY - BOOK CATEGORIES
        ===================================================== */

        const LIBRARY_CATEGORIES = [

            "Academic & Education",
            "Computer & Technology",
            "Science & Mathematics",
            "Engineering & Medical",
            "Competitive & Government Exams",
            "Business & Management",
            "History, Geography & Social Science",
            "Literature & Fiction",
            "Self-Help & Biography",
            "General & Reference"

        ];


        /* =====================================================
           LOAD BOOK CATEGORIES INTO FILTER
        ===================================================== */

        function loadLibraryCategories() {

            const categoryFilter =
                document.getElementById(
                    "categoryFilter"
                );


            if (!categoryFilter) {
                return;
            }


            categoryFilter.innerHTML = "";


            const allOption =
                document.createElement(
                    "option"
                );


            allOption.value =
                "all";


            allOption.textContent =
                "All Categories";


            categoryFilter.appendChild(
                allOption
            );


            LIBRARY_CATEGORIES.forEach(
                function (category) {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        category;


                    option.textContent =
                        category;


                    categoryFilter.appendChild(
                        option
                    );

                }
            );

        }


        /* =================================================
           DISPLAY BOOKS - CURRENT PAGE
        ================================================= */

        function displayCurrentPage() {

            if (!bookContainer) {
                return;
            }


            bookContainer.innerHTML = "";


            if (
                !currentBookList ||
                currentBookList.length === 0
            ) {

                bookContainer.innerHTML = `

                    <p style="
                        grid-column: 1 / -1;
                        text-align: center;
                        padding: 40px;
                        color: #64748b;
                    ">

                        No books found 📚

                    </p>

                `;


                updatePagination();

                return;

            }


            const totalPages =
                Math.ceil(
                    currentBookList.length /
                    BOOKS_PER_PAGE
                );


            if (currentPage > totalPages) {

                currentPage =
                    totalPages;

            }


            if (currentPage < 1) {

                currentPage = 1;

            }


            const startIndex =
                (currentPage - 1) *
                BOOKS_PER_PAGE;


            const endIndex =
                startIndex +
                BOOKS_PER_PAGE;


            const booksToDisplay =
                currentBookList.slice(
                    startIndex,
                    endIndex
                );


            booksToDisplay.forEach(
                function (book) {

                    let statusHTML = "";


                    if (book.rentedBy) {

                        statusHTML = `

                            <div class="rented">
                                🔴 Rented by ${book.rentedBy}
                            </div>

                        `;

                    }


                    else {

                        statusHTML = `

                            <div class="available">
                                🟢 Available
                            </div>

                        `;

                    }


                    const card =
                        document.createElement(
                            "div"
                        );


                    card.className =
                        "book-card";


                    card.innerHTML = `

                        <img
                            src="${book.image}"
                            alt="${book.name}"
                        >

                        <div class="book-card-content">

                            <span class="category-badge">
                                ${book.category}
                            </span>

                            <h3>
                                ${book.name}
                            </h3>

                            <div class="book-author">
                                By ${book.author}
                            </div>

                            ${statusHTML}

                        </div>

                    `;


                    card.onclick =
                        function () {

                            openBookModal(
                                book.id
                            );

                        };


                    bookContainer.appendChild(
                        card
                    );

                }
            );


            updatePagination();

        }


        /* =================================================
           DISPLAY BOOKS
           Compatible function
        ================================================= */

        function displayBooks(bookList) {

            currentBookList =
                Array.isArray(bookList)
                    ? bookList
                    : [];


            currentPage = 1;


            displayCurrentPage();

        }


        /* =================================================
           LOAD BOOKS
        ================================================= */

        async function loadBooksFromBackend() {

            try {

                const response =
                    await fetch(
                        `${API_URL}/books`
                    );


                if (!response.ok) {

                    throw new Error(
                        "Books load failed"
                    );

                }


                const backendBooks =
                    await response.json();


                books =
                    backendBooks.map(
                        function (book) {

                            return {

                                id:
                                    Number(
                                        book.id ??
                                        book.ID
                                    ),

                                name:
                                    book.name ??
                                    book.Name ??
                                    "",

                                author:
                                    book.author ??
                                    book.Author ??
                                    "",

                                category:
                                    book.category ??
                                    book.Category ??
                                    "",

                                year:
                                    Number(
                                        book.year ??
                                        book.Year
                                    ) || "",

                                price:
                                    Number(
                                        book.price ??
                                        book.Price
                                    ) || 0,

                                image:
                                    book.image ??
                                    book.Image ??
                                    "",

                                description:
                                    book.description ??
                                    book.Description ??
                                    "",

                                rentedBy:
                                    book.rented_by ??
                                    book.rentedBy ??
                                    book.RentedBy ??
                                    ""

                            };

                        }
                    );


                filterBooks();

                updateBookStats();

            }


            catch (error) {

                console.error(
                    "Book loading error:",
                    error
                );


                if (bookContainer) {

                    bookContainer.innerHTML = `

                        <p style="
                            grid-column: 1 / -1;
                            text-align: center;
                            padding: 40px;
                            color: #dc2626;
                        ">

                            Unable to load books.
                            Please try again later.

                        </p>

                    `;

                }


                if (pagination) {

                    pagination.style.display =
                        "none";

                }

            }

        }


        /* =================================================
           SEARCH FILTER SORT
        ================================================= */

        const searchInput =
            document.getElementById(
                "searchInput"
            );


        const categoryFilter =
            document.getElementById(
                "categoryFilter"
            );


        loadLibraryCategories();


        const sortBooks =
            document.getElementById(
                "sortBooks"
            );


        const result =
            document.getElementById(
                "result"
            );


        const bookCount =
            document.getElementById(
                "bookCount"
            );


        function filterBooks() {

            /*
               Whenever search/category/sort changes,
               pagination will automatically start from page 1.
            */

            currentPage = 1;


            if (
                !books ||
                books.length === 0
            ) {

                displayBooks([]);


                if (result) {

                    result.innerText =
                        "0 books found";

                }


                if (bookCount) {

                    bookCount.innerText =
                        "Total: 0";

                }


                return;

            }


            const searchText =
                searchInput
                    ? searchInput.value
                        .toLowerCase()
                        .trim()
                    : "";


            const category =
                categoryFilter
                    ? categoryFilter.value
                    : "all";


            let filteredBooks =
                books.filter(
                    function (book) {

                        const bookName =
                            String(
                                book.name || ""
                            ).toLowerCase();


                        const bookAuthor =
                            String(
                                book.author || ""
                            ).toLowerCase();


                        const bookCategory =
                            String(
                                book.category || ""
                            );


                        const matchesSearch =
                            bookName.includes(
                                searchText
                            ) ||
                            bookAuthor.includes(
                                searchText
                            );


                        const matchesCategory =
                            category === "all" ||
                            bookCategory === category;


                        return (
                            matchesSearch &&
                            matchesCategory
                        );

                    }
                );


            if (sortBooks) {

                if (
                    sortBooks.value ===
                    "az"
                ) {

                    filteredBooks.sort(
                        function (a, b) {

                            return String(
                                a.name
                            ).localeCompare(
                                String(
                                    b.name
                                )
                            );

                        }
                    );

                }


                if (
                    sortBooks.value ===
                    "za"
                ) {

                    filteredBooks.sort(
                        function (a, b) {

                            return String(
                                b.name
                            ).localeCompare(
                                String(
                                    a.name
                                )
                            );

                        }
                    );

                }


                if (
                    sortBooks.value ===
                    "newest"
                ) {

                    filteredBooks.sort(
                        function (a, b) {

                            return (
                                Number(
                                    b.year
                                ) -
                                Number(
                                    a.year
                                )
                            );

                        }
                    );

                }


                if (
                    sortBooks.value ===
                    "oldest"
                ) {

                    filteredBooks.sort(
                        function (a, b) {

                            return (
                                Number(
                                    a.year
                                ) -
                                Number(
                                    b.year
                                )
                            );

                        }
                    );

                }

            }


            displayBooks(
                filteredBooks
            );


            if (result) {

                result.innerText =
                    filteredBooks.length +
                    " books found";

            }


            if (bookCount) {

                bookCount.innerText =
                    "Total: " +
                    books.length;

            }

        }


        if (searchInput) {

            searchInput.oninput =
                filterBooks;

        }


        if (categoryFilter) {

            categoryFilter.onchange =
                filterBooks;

        }


        if (sortBooks) {

            sortBooks.onchange =
                filterBooks;

        }


        /* =================================================
           CLEAR SEARCH
        ================================================= */

        const clearBtn =
            document.getElementById(
                "clearBtn"
            );


        if (clearBtn) {

            clearBtn.onclick =
                function () {

                    if (searchInput) {

                        searchInput.value =
                            "";

                    }


                    if (categoryFilter) {

                        categoryFilter.value =
                            "all";

                    }


                    if (sortBooks) {

                        sortBooks.value =
                            "default";

                    }


                    currentPage = 1;


                    filterBooks();

                };

        }


        /* =================================================
           BOOK STATS
        ================================================= */

        function updateBookStats() {

            const totalBooks =
                document.getElementById(
                    "totalBooks"
                );


            const availableBooks =
                document.getElementById(
                    "availableBooks"
                );


            if (totalBooks) {

                totalBooks.innerText =
                    books.length;

            }


            const available =
                books.filter(
                    function (book) {

                        return !book.rentedBy;

                    }
                );


            if (availableBooks) {

                availableBooks.innerText =
                    available.length;

            }

        }


        /* =================================================
           BOOK MODAL
        ================================================= */

        const bookModal =
            document.getElementById(
                "bookModal"
            );


        const modalImage =
            document.getElementById(
                "modalImage"
            );


        const modalTitle =
            document.getElementById(
                "modalTitle"
            );


        const modalAuthor =
            document.getElementById(
                "modalAuthor"
            );


        const modalCategory =
            document.getElementById(
                "modalCategory"
            );


        const modalDescription =
            document.getElementById(
                "modalDescription"
            );


        const modalYear =
            document.getElementById(
                "year"
            );


        const modalPrice =
            document.getElementById(
                "modalPrice"
            );


        const modalStatus =
            document.getElementById(
                "modalStatus"
            );


        const rentModalBtn =
            document.getElementById(
                "rentModalBtn"
            );


        const submitModalBtn =
            document.getElementById(
                "submitModalBtn"
            );


        function openBookModal(bookId) {

            selectedBookId =
                Number(bookId);


            const book =
                books.find(
                    function (item) {

                        return (
                            Number(item.id) ===
                            Number(bookId)
                        );

                    }
                );


            if (!book) {

                return;

            }


            if (modalImage) {

                modalImage.src =
                    book.image;

            }


            if (modalTitle) {

                modalTitle.innerText =
                    book.name;

            }


            if (modalAuthor) {

                modalAuthor.innerText =
                    "Author: " +
                    book.author;

            }


            if (modalCategory) {

                modalCategory.innerText =
                    book.category;

            }


            if (modalYear) {

                modalYear.innerText =
                    "Year: " +
                    book.year;

            }


            if (modalPrice) {

                modalPrice.innerText =
                    "Price: ₹" +
                    book.price;

            }


            if (modalDescription) {

                modalDescription.innerText =
                    book.description;

            }


            if (book.rentedBy) {

                if (modalStatus) {

                    modalStatus.innerHTML = `

                        <p style="
                            color: #dc2626;
                            font-weight: bold;
                        ">

                            🔴 Rented by
                            ${book.rentedBy}

                        </p>

                    `;

                }


                if (rentModalBtn) {

                    rentModalBtn.style.display =
                        "none";

                }


                if (submitModalBtn) {

                    submitModalBtn.style.display =
                        "inline-block";

                }

            }


            else {

                if (modalStatus) {

                    modalStatus.innerHTML = `

                        <p style="
                            color: #16a34a;
                            font-weight: bold;
                        ">

                            🟢 Book Available

                        </p>

                    `;

                }


                if (rentModalBtn) {

                    rentModalBtn.style.display =
                        "inline-block";

                }


                if (submitModalBtn) {

                    submitModalBtn.style.display =
                        "none";

                }

            }


            if (bookModal) {

                bookModal.style.display =
                    "flex";

            }

        }


        /* =================================================
           CLOSE BOOK MODAL
        ================================================= */

        const closeBtn =
            document.getElementById(
                "closeBtn"
            );


        if (closeBtn) {

            closeBtn.onclick =
                function () {

                    if (bookModal) {

                        bookModal.style.display =
                            "none";

                    }

                };

        }


        /* =================================================
           RENT BOOK
        ================================================= */

        if (rentModalBtn) {

            rentModalBtn.onclick =
                async function () {

                    const loggedUser =
                        localStorage.getItem(
                            "loggedUser"
                        );


                    if (!loggedUser) {

                        alert(
                            "Please login first to rent a book."
                        );


                        if (bookModal) {

                            bookModal.style.display =
                                "none";

                        }


                        openLogin();

                        return;

                    }


                    const book =
                        books.find(
                            function (item) {

                                return (
                                    Number(item.id) ===
                                    Number(
                                        selectedBookId
                                    )
                                );

                            }
                        );


                    if (!book) {

                        alert(
                            "Book not found."
                        );

                        return;

                    }


                    if (book.rentedBy) {

                        alert(
                            "This book is already rented."
                        );

                        return;

                    }


                    const savedUser =
                        localStorage.getItem(
                            "libraryUser"
                        );


                    if (!savedUser) {

                        alert(
                            "User data not found."
                        );

                        return;

                    }


                    let user;


                    try {

                        user =
                            JSON.parse(
                                savedUser
                            );

                    }


                    catch (error) {

                        alert(
                            "User data is corrupted."
                        );

                        return;

                    }


                    try {

                        const response =
                            await fetch(
                                `${API_URL}/rent`,
                                {

                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({

                                        name:
                                            user.name,

                                        email:
                                            user.email,

                                        book:
                                            book.name,

                                        author:
                                            book.author,

                                        bookId:
                                            book.id

                                    })

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            alert(
                                data.message ||
                                "Rent failed."
                            );

                            return;

                        }


                        alert(
                            "Book rented successfully!"
                        );


                        if (bookModal) {

                            bookModal.style.display =
                                "none";

                        }


                        await loadBooksFromBackend();

                    }


                    catch (error) {

                        console.error(
                            "Rent Error:",
                            error
                        );


                        alert(
                            "Unable to connect to backend server."
                        );

                    }

                };

        }


        /* =================================================
           SUBMIT BOOK
        ================================================= */

        if (submitModalBtn) {

            submitModalBtn.onclick =
                async function () {

                    const book =
                        books.find(
                            function (item) {

                                return (
                                    Number(item.id) ===
                                    Number(
                                        selectedBookId
                                    )
                                );

                            }
                        );


                    if (!book) {

                        alert(
                            "Book not found."
                        );

                        return;

                    }


                    const loggedUser =
                        localStorage.getItem(
                            "loggedUser"
                        );


                    if (!loggedUser) {

                        alert(
                            "Please login first."
                        );

                        return;

                    }


                    if (
                        book.rentedBy !==
                        loggedUser
                    ) {

                        alert(
                            "Only the person who rented this book can submit it."
                        );

                        return;

                    }


                    const savedUser =
                        localStorage.getItem(
                            "libraryUser"
                        );


                    if (!savedUser) {

                        alert(
                            "User data not found."
                        );

                        return;

                    }


                    let user;


                    try {

                        user =
                            JSON.parse(
                                savedUser
                            );

                    }


                    catch (error) {

                        alert(
                            "User data is corrupted."
                        );

                        return;

                    }


                    try {

                        const response =
                            await fetch(
                                `${API_URL}/submit`,
                                {

                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({

                                        name:
                                            user.name,

                                        email:
                                            user.email,

                                        book:
                                            book.name,

                                        author:
                                            book.author,

                                        bookId:
                                            book.id

                                    })

                                }
                            );


                        const data =
                            await response.json();


                        if (!response.ok) {

                            alert(
                                data.message ||
                                "Submit failed."
                            );

                            return;

                        }


                        alert(
                            "Book submitted successfully! 📚"
                        );


                        if (bookModal) {

                            bookModal.style.display =
                                "none";

                        }


                        await loadBooksFromBackend();

                    }


                    catch (error) {

                        console.error(
                            "Submit Error:",
                            error
                        );


                        alert(
                            "Unable to connect to backend server."
                        );

                    }

                };

        }


        /* =================================================
           EXPLORE
        ================================================= */

        const exploreBtn =
            document.getElementById(
                "exploreBtn"
            );


        if (exploreBtn) {

            exploreBtn.onclick =
                function () {

                    const booksSection =
                        document.getElementById(
                            "books"
                        );


                    if (booksSection) {

                        booksSection.scrollIntoView({
                            behavior: "smooth"
                        });

                    }

                };

        }


        /* =================================================
           THEME
        ================================================= */

        const themeBtn =
            document.getElementById(
                "themeBtn"
            );


        const mobileThemeBtn =
            document.getElementById(
                "mobileThemeBtn"
            );


        function updateThemeButton() {

            const isDark =
                document.body.classList.contains(
                    "dark"
                );


            if (themeBtn) {

                themeBtn.innerText =
                    isDark
                        ? "☀️"
                        : "🌙";

            }


            if (mobileThemeBtn) {

                mobileThemeBtn.innerText =
                    isDark
                        ? "☀️ Light"
                        : "🌙 Dark";

            }

        }


        function toggleTheme() {

            document.body.classList.toggle(
                "dark"
            );


            const isDark =
                document.body.classList.contains(
                    "dark"
                );


            localStorage.setItem(
                "darkMode",
                isDark
            );


            updateThemeButton();

        }


        if (themeBtn) {

            themeBtn.onclick =
                toggleTheme;

        }


        if (mobileThemeBtn) {

            mobileThemeBtn.onclick =
                function () {

                    toggleTheme();


                    if (mainMenu) {

                        mainMenu.classList.remove(
                            "active"
                        );

                    }

                };

        }


        if (
            localStorage.getItem(
                "darkMode"
            ) === "true"
        ) {

            document.body.classList.add(
                "dark"
            );

        }


        updateThemeButton();


        /* =================================================
           TOP BUTTON
        ================================================= */

        const topBtn =
            document.getElementById(
                "topBtn"
            );


        window.addEventListener(
            "scroll",
            function () {

                if (!topBtn) {

                    return;

                }


                if (
                    window.scrollY >
                    400
                ) {

                    topBtn.style.display =
                        "block";

                }

                else {

                    topBtn.style.display =
                        "none";

                }

            }
        );


        if (topBtn) {

            topBtn.onclick =
                function () {

                    window.scrollTo({

                        top: 0,

                        behavior: "smooth"

                    });

                };

        }


        /* =================================================
           CLOSE MODALS OUTSIDE
        ================================================= */

        window.addEventListener(
            "click",
            function (event) {


                if (
                    bookModal &&
                    event.target ===
                    bookModal
                ) {

                    bookModal.style.display =
                        "none";

                }


                if (
                    loginModal &&
                    event.target ===
                    loginModal
                ) {

                    loginModal.style.display =
                        "none";

                }


                if (
                    registerModal &&
                    event.target ===
                    registerModal
                ) {

                    registerModal.style.display =
                        "none";

                }


                if (
                    forgotPasswordModal &&
                    event.target ===
                    forgotPasswordModal
                ) {

                    forgotPasswordModal.style.display =
                        "none";


                    forgotPasswordModal.classList.remove(
                        "show"
                    );

                }

            }
        );


        /* =================================================
           INITIAL LOAD
        ================================================= */

        updateAttendanceVisibility();
        loadBooksFromBackend();
        updateUserUI();
        updateMyRentalVisibility();
        refreshProfileFromBackend();


        console.log(
            "Atal Library JavaScript loaded successfully."
        );

    }
);


/* =====================================================
   ADMIN LOGIN BUTTON
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const adminLoginBtn =
            document.getElementById(
                "adminLoginBtn"
            );


        if (adminLoginBtn) {

            adminLoginBtn.addEventListener(
                "click",
                function () {

                    window.location.href =
                        "admin-login.html";

                }
            );

        }


        /* =============================================
           MOBILE ADMIN LOGIN
        ============================================= */

        const mobileAdminLoginBtn =
            document.getElementById(
                "mobileAdminLoginBtn"
            );


        if (mobileAdminLoginBtn) {

            mobileAdminLoginBtn.addEventListener(
                "click",
                function () {

                    window.location.href =
                        "admin-login.html";

                }
            );

        }

    }
);


/* =====================================================
   FORMAT ATTENDANCE TIME
===================================================== */

function formatAttendanceTime(value) {

    if (!value) {

        return "-";

    }


    const date =
        new Date(value);


    if (isNaN(date.getTime())) {

        return value;

    }


    return date.toLocaleString(
        "en-IN",
        {
            dateStyle: "medium",
            timeStyle: "medium"
        }
    );

}


/* =====================================================
   UPDATE ATTENDANCE UI
===================================================== */

function updateAttendanceUI(
    inside,
    attendance
) {

    const loginMessage =
        document.getElementById(
            "attendanceLoginMessage"
        );


    const controls =
        document.getElementById(
            "attendanceControls"
        );


    const welcome =
        document.getElementById(
            "attendanceWelcome"
        );


    const status =
        document.getElementById(
            "attendanceStatus"
        );


    const time =
        document.getElementById(
            "attendanceTime"
        );


    const enterBtn =
        document.getElementById(
            "enterLibraryBtn"
        );


    const exitBtn =
        document.getElementById(
            "exitLibraryBtn"
        );


    const deleteBtn =
        document.getElementById(
            "deleteAccountBtn"
        );


    const user =
        getAttendanceUser();


    /* =================================================
       NOT LOGGED IN
    ================================================= */

    if (
        !user ||
        !user.email
    ) {

        if (loginMessage) {

            loginMessage.style.display =
                "block";

        }


        if (controls) {

            controls.style.display =
                "none";

        }


        updateAttendanceVisibility();


        return;

    }


    /* =================================================
       LOGGED IN
    ================================================= */

    if (loginMessage) {

        loginMessage.style.display =
            "none";

    }


    if (controls) {

        controls.style.display =
            "block";

    }


    if (welcome) {

        welcome.textContent =
            "Welcome, " +
            (user.name || "User") +
            " 👋";

    }


    /* =================================================
       DELETE BUTTON
    ================================================= */

    if (deleteBtn) {

        deleteBtn.style.display =
            "inline-block";

    }


    /* =================================================
       INSIDE
    ================================================= */

    if (inside) {

        if (status) {

            status.textContent =
                "🟢 You are currently inside the library.";


            status.style.color =
                "#16a34a";

        }


        if (time) {

            time.textContent =
                "Entry Time: " +
                formatAttendanceTime(
                    attendance?.entry_time ||
                    attendance?.EntryTime
                );

        }


        if (enterBtn) {

            enterBtn.disabled =
                true;


            enterBtn.style.opacity =
                "0.6";


            enterBtn.style.cursor =
                "not-allowed";

        }


        if (exitBtn) {

            exitBtn.disabled =
                false;


            exitBtn.style.opacity =
                "1";


            exitBtn.style.cursor =
                "pointer";

        }

    }


    /* =================================================
       OUTSIDE
    ================================================= */

    else {

        if (status) {

            status.textContent =
                "⚪ You are currently outside the library.";


            status.style.color =
                "#64748b";

        }


        if (time) {

            time.textContent =
                "No active library entry.";

        }


        if (enterBtn) {

            enterBtn.disabled =
                false;


            enterBtn.style.opacity =
                "1";


            enterBtn.style.cursor =
                "pointer";

        }


        if (exitBtn) {

            exitBtn.disabled =
                true;


            exitBtn.style.opacity =
                "0.6";


            exitBtn.style.cursor =
                "not-allowed";

        }

    }


    updateAttendanceVisibility();

}


/* =====================================================
   LOAD ATTENDANCE STATUS
===================================================== */

async function loadAttendanceStatus() {

    const user =
        getAttendanceUser();


    // User login nahi hai
    if (!user || !user.email) {

        updateAttendanceUI(false, null);

        return;

    }


    try {

        const response =
            await fetch(
                `${API_URL}/attendance/status?email=${encodeURIComponent(user.email)}`
            );


        const data =
            await response.json();


        console.log(
            "Attendance Status Response:",
            data
        );


        if (!response.ok) {

            console.error(
                "Attendance status error:",
                data
            );


            updateAttendanceUI(
                false,
                null
            );


            return;

        }


        updateAttendanceUI(
            data.inside === true,
            data.attendance || null
        );

    }


    catch (error) {

        console.error(
            "Attendance status connection error:",
            error
        );


        updateAttendanceUI(
            false,
            null
        );

    }

}


/* =====================================================
   ENTER LIBRARY
===================================================== */

async function enterLibrary() {

    const user =
        getAttendanceUser();


    if (
        !user ||
        !user.email
    ) {

        alert(
            "Please login first."
        );

        return;

    }


    const button =
        document.getElementById(
            "enterLibraryBtn"
        );


    try {

        if (button) {

            button.disabled =
                true;


            button.textContent =
                "Recording...";

        }


        const response =
            await fetch(
                `${API_URL}/attendance/enter`,
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        email:
                            user.email

                    })

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            alert(
                data.message ||
                "Unable to record entry."
            );

            return;

        }


        alert(
            "Entry recorded successfully. Welcome to Atal Library! 📚"
        );


        updateAttendanceUI(
            true,
            data.attendance
        );


        await loadAttendanceStatus();

    }


    catch (error) {

        console.error(
            "Enter library error:",
            error
        );


        alert(
            "Unable to connect to backend server."
        );

    }


    finally {

        if (button) {

            button.textContent =
                "🚪 Enter in Library";

        }

    }

}


/* =====================================================
   EXIT LIBRARY
===================================================== */

async function exitLibrary() {

    const user =
        getAttendanceUser();


    if (
        !user ||
        !user.email
    ) {

        alert(
            "Please login first."
        );

        return;

    }


    const button =
        document.getElementById(
            "exitLibraryBtn"
        );


    try {

        if (button) {

            button.disabled =
                true;


            button.textContent =
                "Recording...";

        }


        const response =
            await fetch(
                `${API_URL}/attendance/exit`,
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        email:
                            user.email

                    })

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            alert(
                data.message ||
                "Unable to record exit."
            );

            return;

        }


        alert(
            "Exit recorded successfully. Goodbye! 👋"
        );


        updateAttendanceUI(
            false,
            null
        );


        await loadAttendanceStatus();

    }


    catch (error) {

        console.error(
            "Exit library error:",
            error
        );


        alert(
            "Unable to connect to backend server."
        );

    }


    finally {

        if (button) {

            button.textContent =
                "🚶 Exit from Library";

        }

    }

}


/* =====================================================
   DELETE MY ACCOUNT
===================================================== */

async function deleteMyAccount() {

    const user =
        getAttendanceUser();


    if (
        !user ||
        !user.email
    ) {

        alert(
            "Please login first."
        );

        return;

    }


    const firstConfirm =
        confirm(
            "Are you sure you want to permanently delete your Atal Library account?"
        );


    if (!firstConfirm) {

        return;

    }


    const password =
        prompt(
            "Enter your account password to confirm deletion:"
        );


    if (!password) {

        return;

    }


    try {

        const response =
            await fetch(
                `${API_URL}/account`,
                {

                    method: "DELETE",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        email:
                            user.email,

                        password:
                            password

                    })

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            alert(
                data.message ||
                "Unable to delete account."
            );

            return;

        }


        /* =============================================
           CLEAR LOGIN DATA
        ============================================= */

        localStorage.removeItem(
            "loggedUser"
        );


        localStorage.removeItem(
            "libraryUser"
        );


        updateUserUI();


        updateAttendanceUI(
            false,
            null
        );


        updateAttendanceVisibility();


        alert(
            "Your account has been deleted successfully."
        );

    }


    catch (error) {

        console.error(
            "Delete account error:",
            error
        );


        alert(
            "Unable to connect to backend server."
        );

    }

}


/* =====================================================
   ATTENDANCE BUTTONS
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const enterLibraryBtn =
            document.getElementById(
                "enterLibraryBtn"
            );


        const exitLibraryBtn =
            document.getElementById(
                "exitLibraryBtn"
            );


        const deleteAccountBtn =
            document.getElementById(
                "deleteAccountBtn"
            );


        if (enterLibraryBtn) {

            enterLibraryBtn.onclick =
                enterLibrary;

        }


        if (exitLibraryBtn) {

            exitLibraryBtn.onclick =
                exitLibrary;

        }


        if (deleteAccountBtn) {

            deleteAccountBtn.onclick =
                deleteMyAccount;

        }


        /* =============================================
           INITIAL ATTENDANCE
        ============================================= */

        updateAttendanceVisibility();

        loadAttendanceStatus();

    }
);


/* =====================================================
   EXTRA SAFETY:
   Keep attendance visibility synchronized
===================================================== */

setInterval(
    function () {

        updateAttendanceVisibility();

    },
    1000
);