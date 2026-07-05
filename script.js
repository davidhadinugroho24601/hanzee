let userXP = parseInt(localStorage.getItem("hanzi_xp_simple")) || 0;
let userStreak = parseInt(localStorage.getItem("hanzi_streak_simple")) || 0;
let lastQuizDate = localStorage.getItem("hanzi_last_quiz_date_simple") || "";

let activeFlashcardDeck = [...hanziDatabase];
let currentFlashcardIndex = 0;

// Quiz State Config
let quizLevel = "beginner";
let quizMode = "hanzi-to-meaning";
let activeQuizQuestionsList = [];
let currentQuestionIndex = 0;
let quizScore = 0;
let quizTimerInterval = null;
let quizTimeLimit = 10;
let activeTimeRemaining = 0;
let quizIncorrectList = [];
let doubleXPForTimer = true;

// --- Audio feedback for quiz (beeps) ---
let audioCtx = null;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playCorrectSound() {
    initAudioContext();
    
    const numRings = 3;              // Number of bell rings
    const ringDelay = 0.15;          // Seconds between rings
    const baseTime = audioCtx.currentTime;
    
    for (let i = 0; i < numRings; i++) {
        const ringStart = baseTime + (i * ringDelay);
        
        // Main bell tone – higher pitch & louder
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.frequency.value = 2000;          // Was 1400
        osc1.type = 'sine';
        gain1.gain.setValueAtTime(0.5, ringStart);   // Was 0.3
        gain1.gain.exponentialRampToValueAtTime(0.001, ringStart + 0.4);
        osc1.start(ringStart);
        osc1.stop(ringStart + 0.4);
        
        // Harmonic for richness – also higher & louder
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.value = 2600;          // Was 1800
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.25, ringStart);  // Was 0.15
        gain2.gain.exponentialRampToValueAtTime(0.001, ringStart + 0.3);
        osc2.start(ringStart);
        osc2.stop(ringStart + 0.3);
    }
}

function playWrongSound() {
    initAudioContext();
    // Descending buzzer
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.3);
    osc.type = 'sawtooth';
    gain.gain.value = 0.2;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

window.onload = function() {
    verifyStreakIntegrity();
    updateGlobalStatsUI();
    filterFlashcardsByLevel("all");
    renderDictionary(hanziDatabase);
};

// Tab Switching Mechanism
function switchTab(tabId) {
    document.querySelectorAll('.tab-section').forEach(element => {
        element.classList.add('hidden');
        element.classList.remove('block');
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.add('text-parchment-300', 'border-transparent');
        button.classList.remove('text-amber-400', 'border-amber-400', 'font-semibold');
    });

    let activeSection;
    if (tabId.startsWith('quiz-')) {
        activeSection = document.getElementById(`sec-${tabId}`);
        document.getElementById('tab-quiz').classList.add('text-amber-400', 'border-amber-400', 'font-semibold');
        document.getElementById('tab-quiz').classList.remove('text-parchment-300', 'border-transparent');
    } else {
        activeSection = document.getElementById(`sec-${tabId}`);
        document.getElementById(`tab-${tabId}`).classList.add('text-amber-400', 'border-amber-400', 'font-semibold');
        document.getElementById(`tab-${tabId}`).classList.remove('text-parchment-300', 'border-transparent');
    }

    activeSection.classList.remove('hidden');
    activeSection.classList.add('block');
    
    if (!tabId.startsWith('quiz-active')) {
        clearInterval(quizTimerInterval);
    }
}

function addXP(amount) {
    userXP += amount;
    localStorage.setItem("hanzi_xp_simple", userXP);
    updateGlobalStatsUI();
}

function verifyStreakIntegrity() {
    const today = new Date().toDateString();
    if (lastQuizDate) {
        const lastDate = new Date(lastQuizDate);
        const differenceInDays = (new Date(today).getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
        if (differenceInDays > 1.9) {
            userStreak = 0;
            localStorage.setItem("hanzi_streak_simple", 0);
        }
    } else {
        userStreak = 0;
    }
}

function incrementStreak() {
    const today = new Date().toDateString();
    if (lastQuizDate !== today) {
        userStreak += 1;
        localStorage.setItem("hanzi_streak_simple", userStreak);
        localStorage.setItem("hanzi_last_quiz_date_simple", today);
        lastQuizDate = today;
        updateGlobalStatsUI();
    }
}

function showResetConfirmation() {
    document.getElementById('custom-confirm-modal').classList.remove('hidden');
}

function hideResetConfirmation() {
    document.getElementById('custom-confirm-modal').classList.add('hidden');
}

function confirmResetStats() {
    userXP = 0;
    userStreak = 0;
    lastQuizDate = "";
    localStorage.setItem("hanzi_xp_simple", 0);
    localStorage.setItem("hanzi_streak_simple", 0);
    localStorage.removeItem("hanzi_last_quiz_date_simple");
    updateGlobalStatsUI();
    hideResetConfirmation();
}

function updateGlobalStatsUI() {
    document.getElementById('global-streak').textContent = `${userStreak} Day` + (userStreak !== 1 ? 's' : '');
    document.getElementById('global-xp').textContent = `${userXP} XP`;
}

function filterFlashcardsByLevel(level) {
    if (level === "all") {
        activeFlashcardDeck = [...hanziDatabase];
    } else {
        activeFlashcardDeck = hanziDatabase.filter(item => item.level === level);
    }
    currentFlashcardIndex = 0;
    previousFlashcardIndex = 0;
    renderActiveFlashcard();
}

function renderActiveFlashcard() {
    if (activeFlashcardDeck.length === 0) return;
    const card = activeFlashcardDeck[currentFlashcardIndex];
    
    document.getElementById('study-card-inner').classList.remove('is-flipped');
    
    setTimeout(() => {
        document.getElementById('card-front-hanzi').textContent = card.hanzi;
        document.getElementById('card-front-level').textContent = card.level.toUpperCase();
        
        document.getElementById('card-back-hanzi').textContent = card.hanzi;
        document.getElementById('card-back-pinyin').textContent = card.pinyin;
        document.getElementById('card-back-meaning').textContent = card.meaning;
        document.getElementById('card-back-radical').textContent = card.radical;
        document.getElementById('card-back-strokes').textContent = `${card.strokes} strokes`;
        document.getElementById('card-back-explanation').textContent = card.explanation;
        
        document.getElementById('card-back-sentence').textContent = card.sentence;
        document.getElementById('card-back-sentence-pinyin').textContent = card.sentencePinyin;
        document.getElementById('card-back-sentence-trans').textContent = card.sentenceTranslation;
        
        if (card.hanzi.length > 2) {
            document.getElementById('card-front-hanzi').className = "text-5xl sm:text-6xl font-serif font-black text-stone-900 relative z-10 select-none";
        } else if (card.hanzi.length === 2) {
            document.getElementById('card-front-hanzi').className = "text-6xl sm:text-7xl font-serif font-black text-stone-900 relative z-10 select-none";
        } else {
            document.getElementById('card-front-hanzi').className = "text-7xl sm:text-9xl font-serif font-black text-stone-900 relative z-10 select-none";
        }
        
        document.getElementById('flashcard-index-indicator').textContent = `${currentFlashcardIndex + 1} / ${activeFlashcardDeck.length}`;
    }, 100);
}

function flipActiveCard() {
    document.getElementById('study-card-inner').classList.toggle('is-flipped');
}

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randomFlashcard() {
    dice = randomInt(1, 2);
    if (dice == 1 && currentFlashcardIndex > 200) { 
        currentFlashcardIndex = (currentFlashcardIndex - randomInt(1, 200)) % activeFlashcardDeck.length;
    } else {   
        currentFlashcardIndex = (currentFlashcardIndex + randomInt(1, 200)) % activeFlashcardDeck.length;
     }
    
    renderActiveFlashcard();
}

function nextFlashcard() {
    currentFlashcardIndex = (currentFlashcardIndex + 1 + activeFlashcardDeck.length) % activeFlashcardDeck.length;
    renderActiveFlashcard();
}
function previousFlashcard() {
    currentFlashcardIndex = (currentFlashcardIndex - 1 + activeFlashcardDeck.length) % activeFlashcardDeck.length;
    renderActiveFlashcard();
}

function setQuizLevel(level) {
    quizLevel = level;
    document.querySelectorAll('.quiz-lvl-btn').forEach(btn => {
        btn.className = "quiz-lvl-btn bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 py-2 rounded-xl text-xs font-bold";
    });
    const activeId = level === 'beginner' ? 'btn-ql-beg' : level === 'intermediate' ?  'btn-ql-int' : level === 'advanced' ?'btn-ql-adv' : 'btn-ql-all';
    document.getElementById(activeId).className = "quiz-lvl-btn bg-cinnabar-50 text-cinnabar-800 border-2 border-cinnabar-700 py-2 rounded-xl text-xs font-bold";
}

function setQuizMode(mode) {
    quizMode = mode;
    document.querySelectorAll('.quiz-mode-btn').forEach(btn => {
        btn.className = "quiz-mode-btn bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 p-3 rounded-xl text-left text-xs font-bold flex justify-between items-center";
        const icon = btn.querySelector('i');
        if (icon) icon.className = icon.className.replace('text-cinnabar-700', 'text-stone-400');
    });
    
    let btnId = '';
    if (mode === 'hanzi-to-meaning') btnId = 'btn-qm-h2m';
    else if (mode === 'meaning-to-hanzi') btnId = 'btn-qm-m2h';
    else if (mode === 'hanzi-to-pinyin') btnId = 'btn-qm-h2p';
    else if (mode === 'pinyin-to-hanzi') btnId = 'btn-qm-p2h';

    const activeBtn = document.getElementById(btnId);
    activeBtn.className = "quiz-mode-btn bg-cinnabar-50 text-cinnabar-800 border-2 border-cinnabar-700 p-3 rounded-xl text-left text-xs font-bold flex justify-between items-center";
    const icon = activeBtn.querySelector('i');
    if (icon) icon.className = icon.className.replace('text-stone-400', 'text-cinnabar-700');
}

function restartQuizWithCurrentConfig() {
    switchTab('quiz-lobby');
    initiateQuizExecution();
}

function initiateQuizExecution() {
    let candidates = [];
    if (quizLevel === "all"){
        candidates = [...hanziDatabase];
    }else{
        candidates = hanziDatabase.filter(item => item.level === quizLevel);
    }
    
    if (candidates.length < 4) return;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    activeQuizQuestionsList = shuffled.slice(0, 10);
    
    currentQuestionIndex = 0;
    quizScore = 0;
    quizIncorrectList = [];
    doubleXPForTimer = document.getElementById('timer-toggle-checkbox').checked;

    switchTab('quiz-active');
    document.getElementById('quiz-level-indicator').textContent = quizLevel.toUpperCase();
    loadQuizQuestion(currentQuestionIndex);
}

function loadQuizQuestion(index) {
    clearInterval(quizTimerInterval);

    document.getElementById('quiz-feedback-box').classList.add('hidden');
    document.getElementById('quiz-feedback-sentence-block').classList.add('hidden');
    document.getElementById('quiz-next-btn').classList.add('hidden');

    const currentTerm = activeQuizQuestionsList[index];
    document.getElementById('quiz-question-counter').textContent = `Question ${index + 1}/10`;
    document.getElementById('quiz-progress-bar').style.width = `${(index / 10) * 100}%`;

    const promptMain = document.getElementById('quiz-question-main');
    const promptHint = document.getElementById('quiz-question-hint');

    const otherPool = hanziDatabase.filter(item => item.id !== currentTerm.id);
    const shuffledWrong = otherPool.sort(() => Math.random() - 0.5).slice(0, 3);
    const rawOptions = [currentTerm, ...shuffledWrong].sort(() => Math.random() - 0.5);

    let questionText = "";
    let hintText = "";
    
    if (quizMode === 'hanzi-to-meaning') {
        questionText = currentTerm.hanzi;
        hintText = "Identify the English definition for this character.";
        promptMain.className = "text-5xl sm:text-6xl font-serif font-black text-stone-900 select-none";
    } else if (quizMode === 'meaning-to-hanzi') {
        questionText = currentTerm.meaning;
        hintText = "Which Traditional Hanzi characters represent this meaning?";
        promptMain.className = "text-xl sm:text-2xl font-serif font-semibold text-stone-800 text-center max-w-lg px-2";
    } else if (quizMode === 'hanzi-to-pinyin') {
        questionText = currentTerm.hanzi;
        hintText = "Determine the correct Mandarin Pinyin transcription with tones.";
        promptMain.className = "text-5xl sm:text-6xl font-serif font-black text-stone-900 select-none";
    } else if (quizMode === 'pinyin-to-hanzi') {
        questionText = currentTerm.pinyin;
        hintText = "Which characters correspond to this phonetic Pinyin?";
        promptMain.className = "text-3xl sm:text-4xl font-mono font-bold text-stone-800 select-none";
    }

    promptMain.textContent = questionText;
    promptHint.textContent = hintText;

    const optionsContainer = document.getElementById('quiz-options-container');
    optionsContainer.innerHTML = '';

    rawOptions.forEach((option, oIdx) => {
        const button = document.createElement('button');
        button.className = "w-full bg-white hover:bg-stone-50 text-stone-800 font-semibold p-3.5 rounded-xl border-2 border-stone-200 hover:border-stone-300 transition duration-150 text-left flex items-center justify-between text-xs sm:text-sm shadow-sm";
        
        let btnDisplayVal = "";
        if (quizMode === 'hanzi-to-meaning') btnDisplayVal = option.meaning;
        else if (quizMode === 'meaning-to-hanzi') btnDisplayVal = option.hanzi;
        else if (quizMode === 'hanzi-to-pinyin') btnDisplayVal = option.pinyin;
        else if (quizMode === 'pinyin-to-hanzi') btnDisplayVal = option.hanzi;

        button.innerHTML = `
            <span class="font-serif font-medium">${btnDisplayVal}</span>
            <span class="text-stone-400 font-mono text-sm bg-stone-50 py-0.5 px-1.5 rounded border border-stone-200/60">Option ${oIdx + 1}</span>
        `;

        button.onclick = () => submitQuizAnswer(button, option, currentTerm);
        optionsContainer.appendChild(button);
    });

    const timerContainer = document.getElementById('quiz-timer-container');
    if (doubleXPForTimer) {
        timerContainer.classList.remove('hidden');
        activeTimeRemaining = quizTimeLimit;
        document.getElementById('quiz-timer-val').textContent = `${activeTimeRemaining}s`;
        
        quizTimerInterval = setInterval(() => {
            activeTimeRemaining--;
            document.getElementById('quiz-timer-val').textContent = `${activeTimeRemaining}s`;
            
            if (activeTimeRemaining <= 0) {
                clearInterval(quizTimerInterval);
                triggerTimeoutFailure(currentTerm);
            }
        }, 1000);
    } else {
        timerContainer.classList.add('hidden');
    }
}

function submitQuizAnswer(selectedButton, selectedOption, correctItem) {
    clearInterval(quizTimerInterval);

    document.querySelectorAll('#quiz-options-container button').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-not-allowed');
    });

    const isCorrect = selectedOption.id === correctItem.id;
    const feedbackBox = document.getElementById('quiz-feedback-box');
    feedbackBox.classList.remove('hidden');

    const sentenceBlock = document.getElementById('quiz-feedback-sentence-block');
    document.getElementById('quiz-feedback-sentence-zh').textContent = `${correctItem.sentence}`;
    document.getElementById('quiz-feedback-sentence-pinyin').textContent = `(${correctItem.sentencePinyin})`;
    document.getElementById('quiz-feedback-sentence-en').textContent = correctItem.sentenceTranslation;
    sentenceBlock.classList.remove('hidden');

    if (isCorrect) {
        playCorrectSound();   // ✅ Audio feedback for correct
        quizScore++;
        selectedButton.classList.remove('bg-white', 'opacity-60', 'border-stone-200');
        selectedButton.classList.add('bg-green-50', 'border-green-600', 'text-green-900', 'opacity-100');
        
        feedbackBox.className = "rounded-xl p-3.5 border bg-green-50 border-green-200 text-green-900 flex items-start gap-3 transition";
        document.getElementById('quiz-feedback-icon').innerHTML = `<i class="fa-solid fa-circle-check text-green-700"></i>`;
        document.getElementById('quiz-feedback-title').textContent = "Correct Answer! (答對了)";
        document.getElementById('quiz-feedback-desc').textContent = `${correctItem.hanzi} [${correctItem.pinyin}] - ${correctItem.meaning}`;
    } else {
        playWrongSound();    // ❌ Audio feedback for wrong
        selectedButton.classList.remove('bg-white', 'opacity-60', 'border-stone-200');
        selectedButton.classList.add('bg-red-50', 'border-red-600', 'text-red-900', 'opacity-100');
        highlightCorrectAnswerButton(correctItem);
        
        feedbackBox.className = "rounded-xl p-3.5 border bg-red-50 border-red-200 text-red-900 flex items-start gap-3 transition";
        document.getElementById('quiz-feedback-icon').innerHTML = `<i class="fa-solid fa-circle-xmark text-red-700"></i>`;
        document.getElementById('quiz-feedback-title').textContent = "Incorrect Choice";
        document.getElementById('quiz-feedback-desc').textContent = `Correct: ${correctItem.hanzi} [${correctItem.pinyin}] meaning: ${correctItem.meaning}`;
        
        quizIncorrectList.push(correctItem);
    }

    document.getElementById('quiz-next-btn').classList.remove('hidden');
}

function triggerTimeoutFailure(correctItem) {
    document.querySelectorAll('#quiz-options-container button').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-not-allowed');
    });

    highlightCorrectAnswerButton(correctItem);

    playWrongSound();    // ❌ Audio feedback for timeout (treated as wrong)

    const feedbackBox = document.getElementById('quiz-feedback-box');
    feedbackBox.classList.remove('hidden');
    feedbackBox.className = "rounded-xl p-3.5 border bg-amber-50 border-amber-200 text-amber-900 flex items-start gap-3 transition";
    
    const sentenceBlock = document.getElementById('quiz-feedback-sentence-block');
    document.getElementById('quiz-feedback-sentence-zh').textContent = `${correctItem.sentence} (${correctItem.sentencePinyin})`;
    document.getElementById('quiz-feedback-sentence-en').textContent = correctItem.sentenceTranslation;
    sentenceBlock.classList.remove('hidden');

    document.getElementById('quiz-feedback-icon').innerHTML = `<i class="fa-solid fa-hourglass-end text-amber-700"></i>`;
    document.getElementById('quiz-feedback-title').textContent = "Time Expired!";
    document.getElementById('quiz-feedback-desc').textContent = `Correct answer was ${correctItem.hanzi}. Speed up next time!`;

    quizIncorrectList.push(correctItem);
    document.getElementById('quiz-next-btn').classList.remove('hidden');
}

function highlightCorrectAnswerButton(correctItem) {
    document.querySelectorAll('#quiz-options-container button').forEach(btn => {
        const text = btn.textContent;
        let matches = false;
        if (quizMode === 'hanzi-to-meaning' && text.includes(correctItem.meaning)) matches = true;
        else if ((quizMode === 'meaning-to-hanzi' || quizMode === 'pinyin-to-hanzi') && text.includes(correctItem.hanzi)) matches = true;
        else if (quizMode === 'hanzi-to-pinyin' && text.includes(correctItem.pinyin)) matches = true;

        if (matches) {
            btn.className = "w-full bg-green-50 text-green-900 font-semibold p-3.5 rounded-xl border-2 border-green-600 transition text-left flex items-center justify-between text-xs sm:text-sm opacity-100";
        }
    });
}

function nextQuizQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < 10) {
        loadQuizQuestion(currentQuestionIndex);
    } else {
        concludeQuizSession();
    }
}

function concludeQuizSession() {
    clearInterval(quizTimerInterval);
    switchTab('quiz-results');
    document.getElementById('quiz-progress-bar').style.width = "100%";

    const scorePercent = quizScore * 10;
    const baseXP = quizScore * 15;
    const timerBonus = doubleXPForTimer ? (quizScore * 10) : 0;
    const totalXP = baseXP + timerBonus;

    addXP(totalXP);
    incrementStreak();

    document.getElementById('res-correct-fraction').textContent = `${quizScore}/10`;
    document.getElementById('res-accuracy-pct').textContent = `${scorePercent}%`;
    document.getElementById('res-xp-gained').textContent = `+${totalXP} XP`;

    const accEl = document.getElementById('res-accuracy-pct');
    if (quizScore >= 8) {
        accEl.className = "text-lg font-black text-emerald-600 mt-0.5";
        triggerConfettiReward();
    } else if (quizScore >= 5) {
        accEl.className = "text-lg font-black text-amber-500 mt-0.5";
    } else {
        accEl.className = "text-lg font-black text-red-600 mt-0.5";
    }

    const reviewContainer = document.getElementById('incorrect-review-container');
    const reviewList = document.getElementById('incorrect-review-list');
    reviewList.innerHTML = '';

    if (quizIncorrectList.length > 0) {
        reviewContainer.classList.remove('hidden');
        quizIncorrectList.forEach(item => {
            const row = document.createElement('div');
            row.className = "bg-stone-50 p-2.5 rounded-xl border border-stone-200 flex justify-between items-start text-sm gap-4";
            row.innerHTML = `
                <div class="space-y-1">
                    <div>
                        <span class="font-serif font-bold text-stone-900 text-sm">${item.hanzi}</span>
                        <span class="text-sm text-stone-500 font-mono ml-1">[${item.pinyin}]</span>
                        <p class="text-sm text-stone-700 font-medium">${item.meaning}</p>
                    </div>
                    <div class="bg-white px-2 py-1 rounded border border-stone-200/50 text-sm text-stone-500">
                        <span class="font-serif font-bold text-stone-700">例: ${item.sentence}</span>
                        <p class="italic text-sm text-stone-500 mt-0.5">${item.sentenceTranslation}</p>
                    </div>
                </div>
            `;
            reviewList.appendChild(row);
        });
    } else {
        reviewContainer.classList.add('hidden');
    }
}

function triggerConfettiReward() {
    if (typeof confetti !== "undefined") {
        const duration = 1.5 * 1000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#D4AF37', '#9F1D35', '#2E7D32']
            });
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#D4AF37', '#9F1D35', '#2E7D32']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }
}

let currentPage = 1;
const itemsPerPage = 12;
let currentDataSet = [];

function renderDictionary(data, resetPage = true) {
    const grid = document.getElementById('dictionary-grid');
    grid.innerHTML = '';

    if (resetPage) {
        currentPage = 1;
        const levelOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
        currentDataSet = [...data].sort((a, b) => {
            return (levelOrder[a.level] || 4) - (levelOrder[b.level] || 4);
        });
    }

    const totalItems = currentDataSet.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = currentDataSet.slice(startIndex, endIndex);

    paginatedData.forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-xl p-4 shadow-sm border border-stone-200 hover:shadow transition-all flex flex-col justify-between space-y-3";
        
        const lvlTag = item.level === 'beginner' 
            ? '<span class="bg-green-50 text-green-700 text-sm font-bold px-2 py-0.5 rounded border border-green-200">BEGINNER</span>' 
            : item.level === 'intermediate'
            ? '<span class="bg-amber-50 text-amber-700 text-sm font-bold px-2 py-0.5 rounded border border-amber-200">INTERMEDIATE</span>'
            : '<span class="bg-red-50 text-red-700 text-sm font-bold px-2 py-0.5 rounded border border-red-200">ADVANCED</span>';

        card.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    ${lvlTag}
                </div>

                <div class="flex items-center space-x-3.5 pt-1">
                    <h3 class="text-4xl font-serif font-black text-stone-900 select-none">${item.hanzi}</h3>
                    <div>
                        <h4 class="text-sm font-bold text-cinnabar-700 font-mono">${item.pinyin}</h4>
                        <p class="text-sm text-stone-500 uppercase tracking-wider">${item.radical}部首</p>
                    </div>
                </div>

                <div class="border-t pt-2 text-xs space-y-1">
                    <p class="text-sm text-stone-400 font-bold uppercase tracking-wider">Definition</p>
                    <p class="text-xs font-bold text-stone-800">${item.meaning}</p>
                </div>

                <div class="bg-stone-50 p-2 rounded-lg border border-stone-200 space-y-1">
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-cinnabar-800 font-bold uppercase tracking-wide">Example Sentence (例句)</span>
                    </div>
                    <p class="text-xs font-serif font-semibold text-stone-900">${item.sentence}</p>
                    <p class="text-sm font-mono text-stone-500">${item.sentencePinyin}</p>
                    <p class="text-sm text-stone-600 italic border-t border-stone-200/50 pt-0.5">${item.sentenceTranslation}</p>
                </div>

                <p class="text-sm text-stone-600 leading-relaxed bg-amber-50/30 p-2 rounded-lg border border-amber-100/50">${item.explanation}</p>
            </div>
        `;
        grid.appendChild(card);
    });

    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    let pagContainer = document.getElementById('dictionary-pagination');
    
    if (!pagContainer) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'dictionary-pagination';
        pagContainer.className = "flex justify-center items-center gap-1.5 mt-8 w-50%";
        document.getElementById('dictionary-grid').after(pagContainer);
    }

    pagContainer.innerHTML = '';

    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.disabled = currentPage === 1;
    prevBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${currentPage === 1 ? 'text-stone-300 border-stone-100 cursor-not-allowed' : 'text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900'}`;
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left mr-1"></i> Prev';
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderDictionary(currentDataSet, false);
        }
    };
    pagContainer.appendChild(prevBtn);

    const createPageButton = (pageNo) => {
        const pageBtn = document.createElement('button');
        pageBtn.className = `px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${currentPage === pageNo ? 'bg-stone-900 text-white border-stone-900' : 'text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900'}`;
        pageBtn.innerText = pageNo;
        pageBtn.onclick = () => {
            currentPage = pageNo;
            renderDictionary(currentDataSet, false);
        };
        pagContainer.appendChild(pageBtn);
    };

    const createEllipsis = () => {
        const ellipsis = document.createElement('span');
        ellipsis.className = "px-2 py-1.5 text-xs text-stone-400 select-none font-medium";
        ellipsis.innerText = "...";
        pagContainer.appendChild(ellipsis);
    };

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (currentPage <= 3) {
        endPage = Math.min(5, totalPages);
    } else if (currentPage >= totalPages - 2) {
        startPage = Math.max(1, totalPages - 4);
    }

    if (startPage > 1) {
        createPageButton(1);
        if (startPage > 2) createEllipsis();
    }

    for (let i = startPage; i <= endPage; i++) {
        createPageButton(i);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) createEllipsis();
        createPageButton(totalPages);
    }

    const nextBtn = document.createElement('button');
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${currentPage === totalPages ? 'text-stone-300 border-stone-100 cursor-not-allowed' : 'text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900'}`;
    nextBtn.innerHTML = 'Next <i class="fa-solid fa-chevron-right ml-1"></i>';
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderDictionary(currentDataSet, false);
        }
    };
    pagContainer.appendChild(nextBtn);
}

// Replace the existing filterDictionaryList function
function filterDictionaryList() {
    const query = document.getElementById('dict-search').value.toLowerCase().trim();
    const levelFilter = document.getElementById('dict-level-filter').value;
    
    const filtered = hanziDatabase.filter(item => {
        const matchesSearch = 
            item.hanzi.toLowerCase().includes(query) || 
            item.pinyin.toLowerCase().includes(query) || 
            item.meaning.toLowerCase().includes(query) ||
            item.radical.toLowerCase().includes(query) ||
            item.sentence.toLowerCase().includes(query) ||
            item.sentenceTranslation.toLowerCase().includes(query);
        const matchesLevel = levelFilter === 'all' || item.level === levelFilter;
        return matchesSearch && matchesLevel;
    });
    
    renderDictionary(filtered);
}

// Update window.onload to call filterDictionaryList() 
// (instead of renderDictionary(hanziDatabase))
window.onload = function() {
    verifyStreakIntegrity();
    updateGlobalStatsUI();
    filterFlashcardsByLevel("all");
    filterDictionaryList(); // <-- changed here
};

