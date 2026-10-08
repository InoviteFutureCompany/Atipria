const welcomeTexts = ["👋 Welcome", "👋 Hello", "👋 Hi there", "👋 Greetings"];
let currentIndex = 0;

function rotateWelcomeText() {
    const welcomeTextElement = document.getElementById('welcome-text');
    welcomeTextElement.textContent = welcomeTexts[currentIndex];
    currentIndex = (currentIndex + 1) % welcomeTexts.length;
}
setInterval(rotateWelcomeText, 3000);

function typeWriterErase(elementId, texts, typingSpeed, erasingSpeed, pauseTime) {
    let currentTextIndex = 0;
    let i = 0;
    let isErasing = false;
    const element = document.getElementById(elementId);

    function typing() {
        element.innerHTML = texts[currentTextIndex].substring(0, i) + "<span class='cursor'>|</span>";

        if (i < texts[currentTextIndex].length && !isErasing) {
            i++;
            setTimeout(typing, typingSpeed);
        } else if (i === texts[currentTextIndex].length && !isErasing) {
            setTimeout(erase, pauseTime);
        }
    }

    function erase() {
        isErasing = true;
        if (i > 0) {
            element.innerHTML = texts[currentTextIndex].substring(0, i - 1) + "<span class='cursor'>|</span>";
            i--;
            setTimeout(erase, erasingSpeed);
        } else {
            isErasing = false;
            currentTextIndex = (currentTextIndex + 1) % texts.length;
            setTimeout(typing, pauseTime);
        }
    }

    typing();
}

const texts = [
    "Welcome to Atipria Protection System!",
    "Your security is our priority!",
    "Atipria: Protection, reliability, peace of mind!",
    "Guarding your digital world!",
    "Securing what matters most!",
    "Welcome to the future of protection!"
];

typeWriterErase("main-title", texts, 100, 50, 1000);
