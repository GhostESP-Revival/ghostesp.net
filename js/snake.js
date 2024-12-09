// Initialize game variables
let canvas, ctx;
let snake = [];
let food = {};
let direction = 'right';
let nextDirection = 'right';
let gameLoop;
let score = 0;
let highScore = localStorage.getItem('ghostSnakeHighScore') || 0;
let gameStarted = false;
let gamePaused = false;
let gridSize = 20;
let speed = 100;
let touchStartX = 0;
let touchStartY = 0;
let isMuted = localStorage.getItem('snakeMuted') === 'true';
let bombs = [];
let level = 1;
let bombCount = 2; // Starting number of bombs
let speedIncrease = 0.9; // Speed multiplier per level (0.9 = 10% faster)

// Colors matching the Ghost ESP theme
const colors = {
    snake: '#ff6b00',
    snakeHead: '#9c27b0',
    food: '#ff1a1a',
    grid: 'rgba(255, 107, 0, 0.1)',
    text: '#ffffff',
    background: '#0a0a0f'
};

// Sound effects
const sounds = {
    eat: new Howl({
        src: ['https://assets.codepen.io/21542/howler-push.mp3'],
        volume: 0.3
    }),
    die: new Howl({
        src: ['https://assets.codepen.io/21542/howler-metal-hit.mp3'],
        volume: 0.3
    }),
    move: new Howl({
        src: ['https://assets.codepen.io/21542/howler-tap.mp3'],
        volume: 0.1
    })
};

// Particle effects configuration
const particlesConfig = {
    particles: {
        number: { value: 50 },
        color: { value: '#ff6b00' },
        shape: { type: 'circle' },
        opacity: {
            value: 0.5,
            random: true
        },
        size: {
            value: 3,
            random: true
        },
        move: {
            enable: true,
            speed: 2,
            direction: 'none',
            random: true,
            out_mode: 'out'
        }
    }
};

// Add these sprite definitions at the top with other constants
const sprites = {
    head: {
        up: '👻',
        down: '👻',
        left: '👻',
        right: '👻'
    },
    body: '💨',
    food: '🔮',
    bomb: '💣'
};

// Add at the top with other constants
const ghostSprites = {
    head: {
        up: new Image(),
        down: new Image(),
        left: new Image(),
        right: new Image()
    },
    body: new Image(),
    food: new Image()
};

// Load sprites
ghostSprites.head.up.src = 'https://raw.githubusercontent.com/jaylikesbunda/ghost-snake/main/sprites/ghost-up.png';
ghostSprites.head.down.src = 'https://raw.githubusercontent.com/jaylikesbunda/ghost-snake/main/sprites/ghost-down.png';
ghostSprites.head.left.src = 'https://raw.githubusercontent.com/jaylikesbunda/ghost-snake/main/sprites/ghost-left.png';
ghostSprites.head.right.src = 'https://raw.githubusercontent.com/jaylikesbunda/ghost-snake/main/sprites/ghost-right.png';
ghostSprites.body.src = 'https://raw.githubusercontent.com/jaylikesbunda/ghost-snake/main/sprites/ghost-trail.png';
ghostSprites.food.src = 'https://raw.githubusercontent.com/jaylikesbunda/ghost-snake/main/sprites/ghost-food.png';

function initGame() {
    canvas = document.getElementById('snakeCanvas');
    ctx = canvas.getContext('2d');
    
    // Make canvas responsive
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize snake
    snake = [
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 }
    ];

    // Generate initial food
    generateFood();

    // Add event listeners
    document.addEventListener('keydown', handleKeyPress);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // Prevent scrolling while playing
    document.body.addEventListener('touchmove', preventScroll, { passive: false });

    // Add button event listeners
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);

    // Draw initial state
    draw();

    setupParticles();
}

function resizeCanvas() {
    const gameContainer = document.querySelector('.game-container');
    const size = Math.min(window.innerWidth - 40, 600);
    canvas.width = size;
    canvas.height = size;
    gridSize = Math.floor(size / 30);
    draw();
}

function startGame() {
    if (!gameStarted) {
        gameStarted = true;
        document.getElementById('startBtn').textContent = 'Restart';
        document.getElementById('pauseBtn').style.display = 'inline-block';
        resetGame();
    } else {
        resetGame();
    }
}

function togglePause() {
    if (!gameStarted) return;
    
    if (gamePaused) {
        gameLoop = setInterval(update, speed);
        document.getElementById('pauseBtn').textContent = 'Pause';
    } else {
        clearInterval(gameLoop);
        document.getElementById('pauseBtn').textContent = 'Resume';
    }
    gamePaused = !gamePaused;
}

function resetGame() {
    if (gameLoop) {
        clearInterval(gameLoop);
    }
    
    snake = [
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 }
    ];
    direction = 'right';
    nextDirection = 'right';
    score = 0;
    level = 1;
    speed = 100;
    bombCount = 2;
    gamePaused = false;
    document.getElementById('pauseBtn').textContent = 'Pause';
    
    generateFood();
    generateBombs();
    
    gameLoop = setInterval(update, speed);
    draw();
}

function generateFood() {
    const gridWidth = Math.floor(canvas.width / gridSize);
    const gridHeight = Math.floor(canvas.height / gridSize);
    
    do {
        food = {
            x: Math.floor(Math.random() * (gridWidth - 2)) + 1,
            y: Math.floor(Math.random() * (gridHeight - 2)) + 1
        };
    } while (snake.some(segment => segment.x === food.x && segment.y === food.y));
}

function generateBombs() {
    bombs = [];
    const gridWidth = Math.floor(canvas.width / gridSize);
    const gridHeight = Math.floor(canvas.height / gridSize);
    
    for (let i = 0; i < bombCount; i++) {
        let bombPosition;
        do {
            bombPosition = {
                x: Math.floor(Math.random() * (gridWidth - 2)) + 1,
                y: Math.floor(Math.random() * (gridHeight - 2)) + 1
            };
        } while (
            snake.some(segment => segment.x === bombPosition.x && segment.y === bombPosition.y) ||
            (food.x === bombPosition.x && food.y === bombPosition.y) ||
            bombs.some(bomb => bomb.x === bombPosition.x && bomb.y === bombPosition.y)
        );
        bombs.push(bombPosition);
    }
}

function update() {
    const head = { x: snake[0].x, y: snake[0].y };
    direction = nextDirection;

    switch (direction) {
        case 'up': head.y--; break;
        case 'down': head.y++; break;
        case 'left': head.x--; break;
        case 'right': head.x++; break;
    }

    if (isCollision(head)) {
        gameOver();
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;
        sounds.eat.play();
        
        // Level up every 5 points
        if (score % 5 === 0) {
            levelUp();
        }
        
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('ghostSnakeHighScore', highScore);
        }
        generateFood();
        generateBombs(); // Regenerate bombs when food is eaten
    } else {
        snake.pop();
    }

    draw();
}

function isCollision(head) {
    const gridWidth = Math.floor(canvas.width / gridSize);
    const gridHeight = Math.floor(canvas.height / gridSize);
    
    // Check wall collision
    if (head.x < 0 || head.x >= gridWidth || head.y < 0 || head.y >= gridHeight) {
        return true;
    }

    // Check self collision
    if (snake.some((segment, index) => {
        if (index === 0) return false;
        return segment.x === head.x && segment.y === head.y;
    })) {
        return true;
    }

    // Check bomb collision
    return bombs.some(bomb => bomb.x === head.x && bomb.y === head.y);
}

function gameOver() {
    clearInterval(gameLoop);
    gameStarted = false;
    gamePaused = false;
    sounds.die.play();
    
    // Shake effect
    gsap.to(canvas, {
        x: 10,
        duration: 0.1,
        repeat: 3,
        yoyo: true,
        onComplete: () => {
            gsap.set(canvas, { x: 0 });
        }
    });
    
    document.getElementById('startBtn').textContent = 'Start';
    document.getElementById('pauseBtn').style.display = 'none';
    
    // Draw game over screen with animation
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 30px "Press Start 2P"';
    ctx.textAlign = 'center';
    
    // Animate text
    gsap.from({}, {
        duration: 0.5,
        onComplete: () => {
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
            ctx.font = '20px "Press Start 2P"';
            ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 40);
            ctx.fillText(`High Score: ${highScore}`, canvas.width / 2, canvas.height / 2 + 80);
        }
    });
}

function draw() {
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    // Draw bombs
    ctx.save();
    ctx.font = `${gridSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    bombs.forEach(bomb => {
        const pulseScale = 1 + Math.sin(Date.now() / 500) * 0.1;
        ctx.font = `${gridSize * pulseScale}px Arial`;
        ctx.fillText(sprites.bomb, 
            bomb.x * gridSize + gridSize / 2,
            bomb.y * gridSize + gridSize / 2
        );
    });
    ctx.restore();

    // Draw snake
    snake.forEach((segment, index) => {
        ctx.save();
        ctx.font = `${gridSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const x = segment.x * gridSize + gridSize / 2;
        const y = segment.y * gridSize + gridSize / 2;
        
        if (index === 0) {
            ctx.font = `${gridSize * 1.2}px Arial`;
            ctx.fillText(sprites.head[direction], x, y);
        } else {
            ctx.globalAlpha = 1 - (index / snake.length * 0.5);
            ctx.fillText(sprites.body, x, y);
        }
        ctx.restore();
    });

    // Draw food
    ctx.save();
    ctx.font = `${gridSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pulseScale = 1 + Math.sin(Date.now() / 200) * 0.1;
    ctx.font = `${gridSize * pulseScale}px Arial`;
    ctx.fillText(sprites.food, 
        food.x * gridSize + gridSize / 2,
        food.y * gridSize + gridSize / 2
    );
    ctx.restore();

    // Draw score and level
    ctx.fillStyle = colors.text;
    ctx.font = '20px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 10, 30);
    ctx.fillText(`Level: ${level}`, 10, 60);
    ctx.fillText(`High Score: ${highScore}`, 10, 90);
}

function drawGrid() {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;

    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function handleKeyPress(event) {
    if (!gameStarted) return;

    // Prevent arrow key scrolling
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.key)) {
        event.preventDefault();
    }

    switch (event.key) {
        case 'ArrowUp':
            if (direction !== 'down') nextDirection = 'up';
            break;
        case 'ArrowDown':
            if (direction !== 'up') nextDirection = 'down';
            break;
        case 'ArrowLeft':
            if (direction !== 'right') nextDirection = 'left';
            break;
        case 'ArrowRight':
            if (direction !== 'left') nextDirection = 'right';
            break;
        case 'Space':
            togglePause();
            break;
    }
}

function handleTouchStart(event) {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
}

function handleTouchMove(event) {
    if (!gameStarted || !touchStartX || !touchStartY) return;

    event.preventDefault();
    
    const touchEndX = event.touches[0].clientX;
    const touchEndY = event.touches[0].clientY;
    
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    
    // Determine swipe direction based on the larger movement
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && direction !== 'left') {
            nextDirection = 'right';
        } else if (dx < 0 && direction !== 'right') {
            nextDirection = 'left';
        }
    } else {
        if (dy > 0 && direction !== 'up') {
            nextDirection = 'down';
        } else if (dy < 0 && direction !== 'down') {
            nextDirection = 'up';
        }
    }
    
    touchStartX = touchEndX;
    touchStartY = touchEndY;
}

// Add this function to prevent touch scrolling while playing
function preventScroll(e) {
    if (gameStarted && !gamePaused) {
        e.preventDefault();
    }
}

// Initialize particles
function initParticles() {
    particlesJS('particles-js', particlesConfig);
}

// Add particle container to game
function setupParticles() {
    const container = document.createElement('div');
    container.id = 'particles-js';
    container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
    `;
    document.querySelector('.game-container').appendChild(container);
    initParticles();
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', initGame);

function toggleMute() {
    isMuted = !isMuted;
    localStorage.setItem('snakeMuted', isMuted);
    Howler.mute(isMuted);
    document.getElementById('muteBtn').innerHTML = 
        `<i class="ri-${isMuted ? 'volume-mute' : 'volume-up'}-line"></i>`;
}

function levelUp() {
    level++;
    speed *= speedIncrease;
    bombCount = Math.min(bombCount + 1, 10); // Increase bombs up to max of 10
    
    // Clear and restart game loop with new speed
    clearInterval(gameLoop);
    gameLoop = setInterval(update, speed);
    
    // Show level up message
    const levelUpText = `Level ${level}!`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 30px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(levelUpText, canvas.width / 2, canvas.height / 2);
    
    // Flash effect for bombs
    bombs.forEach(bomb => {
        gsap.to({}, {
            duration: 0.5,
            repeat: 1,
            yoyo: true,
            onUpdate: () => {
                const pulseScale = 1 + Math.sin(Date.now() / 100) * 0.2;
                ctx.font = `${gridSize * pulseScale}px Arial`;
                ctx.fillText(sprites.bomb, 
                    bomb.x * gridSize + gridSize / 2,
                    bomb.y * gridSize + gridSize / 2
                );
            }
        });
    });
} 