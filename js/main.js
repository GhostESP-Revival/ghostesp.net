// Initialize AOS
AOS.init({
    duration: 800,
    once: true
});

// Initialize Feather icons
feather.replace();

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Navbar scroll effect
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(18, 18, 18, 0.95)';
    } else {
        navbar.style.background = 'rgba(18, 18, 18, 0.8)';
    }
});

// Video lazy loading
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const iframe = entry.target;
            if (iframe.dataset.src) {
                iframe.src = iframe.dataset.src;
                iframe.removeAttribute('data-src');
                // Stop observing after loading
                videoObserver.unobserve(iframe);
            }
        }
    });
}, {
    rootMargin: '50px 0px', // Start loading slightly before they come into view
    threshold: 0.1
});

// Observe all video iframes
document.addEventListener('DOMContentLoaded', () => {
    const videoIframes = document.querySelectorAll('.video-wrapper iframe[data-src]');
    videoIframes.forEach(iframe => videoObserver.observe(iframe));
});

// Add intersection observer for animations
const animationObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate');
            animationObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1
});

document.querySelectorAll('[data-aos]').forEach(el => {
    animationObserver.observe(el);
});

// Video section scroll handling
document.addEventListener('DOMContentLoaded', function() {
    const scrollWrapper = document.querySelector('.video-scroll-wrapper');
    const videoCards = document.querySelectorAll('.video-card');
    
    if (!scrollWrapper || videoCards.length === 0) return;

    // Calculate card dimensions
    const cardWidth = videoCards[0].offsetWidth;
    const cardGap = parseInt(getComputedStyle(document.querySelector('.video-scroll')).gap);
    const snapPoints = Array.from(videoCards).map((_, index) => 
        index * (cardWidth + cardGap)
    );

    // Add scroll indicators for mobile
    if (window.innerWidth <= 768) {
        const indicatorContainer = document.createElement('div');
        indicatorContainer.className = 'scroll-indicator';
        
        videoCards.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'scroll-dot' + (index === 0 ? ' active' : '');
            indicatorContainer.appendChild(dot);
        });
        
        scrollWrapper.parentElement.appendChild(indicatorContainer);
        const dots = document.querySelectorAll('.scroll-dot');

        // Update active dot on scroll with debounce
        let scrollTimeout;
        scrollWrapper.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const scrollPosition = scrollWrapper.scrollLeft;
                const activeIndex = findClosestSnapPoint(scrollPosition);
                
                dots.forEach((dot, index) => {
                    dot.classList.toggle('active', index === activeIndex);
                });
            }, 50);
        });
    }

    // Enhanced touch scroll handling
    let isScrolling = false;
    let startX;
    let scrollLeft;
    let startTime;
    let startScrollPosition;

    scrollWrapper.addEventListener('touchstart', (e) => {
        isScrolling = true;
        startX = e.touches[0].pageX;
        scrollLeft = scrollWrapper.scrollLeft;
        startTime = Date.now();
        startScrollPosition = scrollLeft;
        
        // Prevent default only if necessary
        if (Math.abs(scrollWrapper.scrollWidth - scrollWrapper.clientWidth) > 10) {
            e.preventDefault();
        }
    }, { passive: false });

    scrollWrapper.addEventListener('touchmove', (e) => {
        if (!isScrolling) return;
        
        const x = e.touches[0].pageX;
        const walk = (startX - x) * 1.5; // Adjusted scroll speed
        scrollWrapper.scrollLeft = scrollLeft + walk;
        
        // Prevent default only during horizontal scroll
        if (Math.abs(walk) > 10) {
            e.preventDefault();
        }
    }, { passive: false });

    scrollWrapper.addEventListener('touchend', (e) => {
        if (!isScrolling) return;
        isScrolling = false;

        const endTime = Date.now();
        const endScrollPosition = scrollWrapper.scrollLeft;
        const timeElapsed = endTime - startTime;
        const scrollDistance = endScrollPosition - startScrollPosition;
        
        // Calculate velocity (pixels per millisecond)
        const velocity = scrollDistance / timeElapsed;
        
        // Apply momentum if the velocity is significant
        if (Math.abs(velocity) > 0.5) {
            const momentum = velocity * 100; // Adjust this multiplier to control momentum
            const targetScroll = endScrollPosition + momentum;
            const closestSnapPoint = findClosestSnapPoint(targetScroll);
            
            scrollWrapper.scrollTo({
                left: snapPoints[closestSnapPoint],
                behavior: 'smooth'
            });
        } else {
            // Just snap to closest point if no significant velocity
            const closestSnapPoint = findClosestSnapPoint(endScrollPosition);
            scrollWrapper.scrollTo({
                left: snapPoints[closestSnapPoint],
                behavior: 'smooth'
            });
        }
    });

    // Helper function to find closest snap point
    function findClosestSnapPoint(scrollPosition) {
        let closestIndex = 0;
        let closestDistance = Math.abs(snapPoints[0] - scrollPosition);
        
        snapPoints.forEach((point, index) => {
            const distance = Math.abs(point - scrollPosition);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });
        
        return closestIndex;
    }

    // Prevent scroll chaining
    scrollWrapper.addEventListener('scroll', (e) => {
        if (scrollWrapper.scrollLeft === 0) {
            scrollWrapper.scrollLeft = 1;
        } else if (scrollWrapper.scrollLeft === scrollWrapper.scrollWidth - scrollWrapper.clientWidth) {
            scrollWrapper.scrollLeft = scrollWrapper.scrollWidth - scrollWrapper.clientWidth - 1;
        }
    });
}); 

function initChristmasTheme() {
    // Check if we're in the Christmas season (December)
    const today = new Date();
    const isChristmasSeason = today.getMonth() === 11; // December

    if (isChristmasSeason) {
        // Add Christmas theme class
        document.body.classList.add('christmas-theme');
        
        // Create snowfall container
        const snowfall = document.createElement('div');
        snowfall.className = 'snowfall';
        document.body.appendChild(snowfall);

        // Create snowflakes
        const snowflakes = ['❄', '❅', '❆', '✧', '✦'];
        const numberOfSnowflakes = 50;

        for (let i = 0; i < numberOfSnowflakes; i++) {
            const snowflake = document.createElement('div');
            snowflake.className = 'snowflake';
            snowflake.style.left = `${Math.random() * 100}%`;
            snowflake.style.opacity = Math.random();
            snowflake.style.animation = `snowfall ${5 + Math.random() * 10}s linear infinite`;
            snowflake.style.animationDelay = `${Math.random() * 5}s`;
            snowflake.innerHTML = snowflakes[Math.floor(Math.random() * snowflakes.length)];
            snowfall.appendChild(snowflake);
        }

        // Add festive icons to feature cards
        const featureIcons = document.querySelectorAll('.feature-card i');
        const christmasIcons = [
            'gift', 'star', 'bell', 'tree', 'candy', 
            'snowflake', 'heart', 'moon', 'sun', 'cloud-snow'
        ];
        
        featureIcons.forEach((icon, index) => {
            if (christmasIcons[index]) {
                icon.setAttribute('data-feather', christmasIcons[index]);
            }
        });
        
        // Re-run Feather icons with explicit parameters
        feather.replace({
            'stroke-width': 2.5,
            'width': 16,
            'height': 16,
            'class': 'feather-icon'
        });
    }
}

// Add this to your DOMContentLoaded event
document.addEventListener('DOMContentLoaded', function() {
    // ... existing DOMContentLoaded code ...
    
    initChristmasTheme();
    
    // Initialize Feather icons
    feather.replace({
        'stroke-width': 2.5,
        'width': 16,
        'height': 16,
        'class': 'feather-icon'
    });
    
    // Theme toggle functionality
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        // Make sure the icon is set
        const icon = themeToggle.querySelector('i');
        if (!icon) {
            const newIcon = document.createElement('i');
            newIcon.setAttribute('data-feather', 'snowflake');
            themeToggle.appendChild(newIcon);
        }
        
        // Re-run feather icons to ensure the new icon is rendered
        feather.replace();
        
        themeToggle.addEventListener('click', function(e) {
            e.preventDefault();
            document.body.classList.toggle('christmas-theme');
            
            // Toggle snowfall
            const snowfall = document.querySelector('.snowfall');
            if (snowfall) {
                snowfall.remove();
            } else {
                initChristmasTheme();
            }
        });
    }

    initMobileMenu();
}); 

function updateChristmasCountdown() {
    const now = new Date();
    const christmas = new Date(now.getFullYear(), 11, 25); // December 25th
    if (now > christmas) {
        christmas.setFullYear(christmas.getFullYear() + 1);
    }
    
    const diff = christmas - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    const countdownEl = document.querySelector('.christmas-countdown');
    if (countdownEl) {
        countdownEl.textContent = `${days}d ${hours}h until Christmas!`;
    }
}

function enhanceSnowfall() {
    const snowflakes = document.querySelectorAll('.snowflake');
    snowflakes.forEach(flake => {
        flake.addEventListener('mouseover', () => {
            flake.style.animation = 'none';
            flake.style.transform = 'scale(1.5)';
            setTimeout(() => {
                flake.style.animation = `snowfall ${5 + Math.random() * 10}s linear infinite`;
            }, 500);
        });
    });
} 

// Single Christmas theme management
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    let presentInterval;
    let snowfallElement;

    // Add auto-initialization for Christmas season
    const initChristmasIfNeeded = () => {
        const today = new Date();
        if (today.getMonth() === 11) { // December
            document.body.classList.add('christmas-theme');
            createSnowfall();
            window.presentInterval = startPresentDropping();
            setTimeout(dropPresent, 100); // Drop first present after slight delay
        }
    };

    const createSnowfall = () => {
        // Remove existing snowfall if any
        const existingSnowfall = document.querySelector('.snowfall');
        if (existingSnowfall) {
            existingSnowfall.remove();
        }
        
        // Create new snowfall container
        snowfallElement = document.createElement('div');
        snowfallElement.className = 'snowfall';
        document.body.appendChild(snowfallElement);

        const snowflakes = ['❄', '❅', '❆', '✧', '✦'];
        const numberOfSnowflakes = 50;

        for (let i = 0; i < numberOfSnowflakes; i++) {
            const snowflake = document.createElement('div');
            snowflake.className = 'snowflake';
            
            // Set random horizontal position
            snowflake.style.left = `${Math.random() * 100}%`;
            
            // Set random animation duration
            const duration = 5 + Math.random() * 10;
            snowflake.style.animationDuration = `${duration}s`;
            
            // Set random delay
            snowflake.style.animationDelay = `${Math.random() * duration}s`;
            
            snowflake.innerHTML = snowflakes[Math.floor(Math.random() * snowflakes.length)];
            
            snowfallElement.appendChild(snowflake);
        }
    };

    const dropPresent = () => {
        const hero = document.querySelector('.hero');
        if (!hero) return;

        const heroWidth = hero.offsetWidth;
        
        // Adjustable offsets for fine-tuning
        const TIMING_OFFSET = +0; // Adjust this value between -1 and 1 to shift timing
        const X_OFFSET = +20; // Adjust this value to shift presents left/right
        const Y_OFFSET = -10; // Adjust this value to shift presents up/down
        
        const flightDuration = 8000;
        const elapsed = Date.now() % flightDuration;
        let progress = (elapsed / flightDuration) + TIMING_OFFSET;
        
        // Ensure progress stays between 0 and 1
        progress = (progress + 1) % 1;
        
        // Calculate position with adjustable offsets
        const totalDistance = heroWidth * 1.5;
        const santaX = (heroWidth - (progress * totalDistance)) + X_OFFSET;
        
        const baseY = hero.offsetHeight * 0.4;
        const bobAmount = 20;
        const bobProgress = (Date.now() % 2000) / 2000;
        const bobOffset = Math.sin(bobProgress * Math.PI * 2) * bobAmount;
        const santaY = baseY + bobOffset + Y_OFFSET;

        const present = document.createElement('div');
        present.className = 'present';
        
        present.style.cssText = `
            position: absolute;
            left: ${santaX}px;
            top: ${santaY}px;
            transform-origin: center;
            z-index: 3;
            font-size: 1.5rem;
        `;
        
        hero.appendChild(present);

        const animation = present.animate([
            {
                top: `${santaY}px`,
                left: `${santaX}px`,
                transform: 'rotate(0deg) scale(1)',
                opacity: 1
            },
            {
                top: `${hero.offsetHeight + 50}px`,
                left: `${santaX + (Math.random() * 40 - 20)}px`,
                transform: 'rotate(720deg) scale(0.5)',
                opacity: 0
            }
        ], {
            duration: 2000,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });

        animation.onfinish = () => present.remove();
    };

    const startPresentDropping = () => {
        if (window.presentInterval) {
            clearInterval(window.presentInterval);
        }
        
        // Drop presents more consistently (every 150ms with 25% chance)
        return setInterval(() => {
            if (Math.random() > 0.75) {
                dropPresent();
            }
        }, 150);
    };

    const cleanupChristmasEffects = () => {
        if (window.presentInterval) {
            clearInterval(window.presentInterval);
            window.presentInterval = null;
        }
        
        // Remove all presents
        document.querySelectorAll('.present').forEach(p => p.remove());
        
        // Remove snowfall
        const snowfall = document.querySelector('.snowfall');
        if (snowfall) {
            snowfall.remove();
        }
    };

    const toggleChristmasTheme = (e) => {
        if (e) {
            e.preventDefault();
        }

        const isCurrentlyChristmas = document.body.classList.contains('christmas-theme');
        
        if (isCurrentlyChristmas) {
            document.body.classList.remove('christmas-theme');
            cleanupChristmasEffects();
        } else {
            document.body.classList.add('christmas-theme');
            createSnowfall();
            window.presentInterval = startPresentDropping();
            setTimeout(dropPresent, 100);
        }
    };

    // Initialize theme toggle
    if (themeToggle) {
        themeToggle.replaceWith(themeToggle.cloneNode(true));
        const newThemeToggle = document.getElementById('theme-toggle');
        newThemeToggle.addEventListener('click', toggleChristmasTheme);
    }

    // Call initialization function
    initChristmasIfNeeded();
}); 

function initMobileMenu() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const body = document.body;
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay';
    document.body.appendChild(overlay);

    function toggleMenu() {
        navLinks.classList.toggle('active');
        overlay.classList.toggle('active');
        body.classList.toggle('menu-open');
        
        // Update menu icon
        const menuIcon = mobileMenuBtn.querySelector('i');
        if (navLinks.classList.contains('active')) {
            menuIcon.setAttribute('data-feather', 'x');
        } else {
            menuIcon.setAttribute('data-feather', 'menu');
        }
        feather.replace();
    }

    // Toggle menu on button click
    mobileMenuBtn.addEventListener('click', toggleMenu);

    // Close menu when clicking overlay
    overlay.addEventListener('click', toggleMenu);

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('active')) {
                toggleMenu();
            }
        });
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            toggleMenu();
        }
    });

    // Prevent menu from staying open on window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navLinks.classList.contains('active')) {
            toggleMenu();
        }
    });
} 