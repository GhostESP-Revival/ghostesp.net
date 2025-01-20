const scriptLoader = {
  loaded: new Set(),

  async load(src) {
    if (this.loaded.has(src)) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;

      script.onload = () => {
        this.loaded.add(src);
        resolve();
      };

      script.onerror = reject;
      document.head.appendChild(script);
    });
  },
};

// Create a lightweight initialization function for critical features
function initCriticalFeatures() {
  // Initialize navbar
  const navbar = document.querySelector(".navbar");
  window.addEventListener("scroll", () => {
    requestAnimationFrame(() => {
      navbar.style.background =
        window.scrollY > 50
          ? "rgba(18, 18, 18, 0.95)"
          : "rgba(18, 18, 18, 0.8)";
    });
  });

  // Initialize smooth scroll (critical for navigation)
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      document
        .querySelector(this.getAttribute("href"))
        .scrollIntoView({ behavior: "smooth" });
    });
  });
}

// Defer non-critical initializations
function initNonCriticalFeatures() {
  // Initialize AOS with reduced motion preference check
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    AOS.init({
      duration: 800,
      once: true,
      startEvent: "load",
    });
  }

  // Initialize Feather icons
  feather.replace({
    "stroke-width": 2.5,
    width: 16,
    height: 16,
    class: "feather-icon",
  });

  // Initialize other features...
  initVideoLazyLoading();
  initMobileMenu();
}

// Split video lazy loading into its own function
function initVideoLazyLoading() {
  const videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const iframe = entry.target;
          if (iframe.dataset.src) {
            iframe.src = iframe.dataset.src;
            iframe.removeAttribute("data-src");
            videoObserver.unobserve(iframe);
          }
        }
      });
    },
    {
      rootMargin: "50px 0px",
      threshold: 0.1,
    }
  );

  document
    .querySelectorAll(".video-wrapper iframe[data-src]")
    .forEach((iframe) => videoObserver.observe(iframe));
}

// Initialize critical features immediately
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Feather icons first
  if (window.feather) {
    feather.replace({
      "stroke-width": 2.5,
      width: 16,
      height: 16,
      class: "feather-icon",
    });
  }

  // Initialize mobile menu
  initMobileMenu();

  // Initialize other critical features
  initCriticalFeatures();

  // Initialize non-critical features
  if (window.requestIdleCallback) {
    requestIdleCallback(() => {
      initNonCriticalFeatures();
      fetchLatestRelease(); // Ensure latest release is fetched
    });
  } else {
    setTimeout(() => {
      initNonCriticalFeatures();
      fetchLatestRelease(); // Ensure latest release is fetched
    }, 1);
  }
});

// Initialize AOS
AOS.init({
  duration: 800,
  once: true,
});

// Initialize Feather icons
feather.replace();

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute("href")).scrollIntoView({
      behavior: "smooth",
    });
  });
});

// Navbar scroll effect
const navbar = document.querySelector(".navbar");
window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    navbar.style.background = "rgba(18, 18, 18, 0.95)";
  } else {
    navbar.style.background = "rgba(18, 18, 18, 0.8)";
  }
});

// Video lazy loading
const videoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const iframe = entry.target;
        if (iframe.dataset.src) {
          iframe.src = iframe.dataset.src;
          iframe.removeAttribute("data-src");
          // Stop observing after loading
          videoObserver.unobserve(iframe);
        }
      }
    });
  },
  {
    rootMargin: "50px 0px", // Start loading slightly before they come into view
    threshold: 0.1,
  }
);

// Observe all video iframes
document.addEventListener("DOMContentLoaded", () => {
  const videoIframes = document.querySelectorAll(
    ".video-wrapper iframe[data-src]"
  );
  videoIframes.forEach((iframe) => videoObserver.observe(iframe));
});

// Add intersection observer for animations
const animationObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("animate");
        animationObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.1,
  }
);

document.querySelectorAll("[data-aos]").forEach((el) => {
  animationObserver.observe(el);
});

// Video section scroll handling
document.addEventListener("DOMContentLoaded", function () {
  const scrollWrapper = document.querySelector(".video-scroll-wrapper");
  const videoCards = document.querySelectorAll(".video-card");

  if (!scrollWrapper || videoCards.length === 0) return;

  // Calculate card dimensions
  const cardWidth = videoCards[0].offsetWidth;
  const cardGap = parseInt(
    getComputedStyle(document.querySelector(".video-scroll")).gap
  );
  const snapPoints = Array.from(videoCards).map(
    (_, index) => index * (cardWidth + cardGap)
  );

  // Add scroll indicators for mobile
  if (window.innerWidth <= 768) {
    const indicatorContainer = document.createElement("div");
    indicatorContainer.className = "scroll-indicator";

    videoCards.forEach((_, index) => {
      const dot = document.createElement("div");
      dot.className = "scroll-dot" + (index === 0 ? " active" : "");
      indicatorContainer.appendChild(dot);
    });

    scrollWrapper.parentElement.appendChild(indicatorContainer);
    const dots = document.querySelectorAll(".scroll-dot");

    // Update active dot on scroll with debounce
    let scrollTimeout;
    scrollWrapper.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollPosition = scrollWrapper.scrollLeft;
        const activeIndex = findClosestSnapPoint(scrollPosition);

        dots.forEach((dot, index) => {
          dot.classList.toggle("active", index === activeIndex);
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

  scrollWrapper.addEventListener(
    "touchstart",
    (e) => {
      isScrolling = true;
      startX = e.touches[0].pageX;
      scrollLeft = scrollWrapper.scrollLeft;
      startTime = Date.now();
      startScrollPosition = scrollLeft;

      // Prevent default only if necessary
      if (
        Math.abs(scrollWrapper.scrollWidth - scrollWrapper.clientWidth) > 10
      ) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  scrollWrapper.addEventListener(
    "touchmove",
    (e) => {
      if (!isScrolling) return;

      const x = e.touches[0].pageX;
      const walk = (startX - x) * 1.5; // Adjusted scroll speed
      scrollWrapper.scrollLeft = scrollLeft + walk;

      // Prevent default only during horizontal scroll
      if (Math.abs(walk) > 10) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  scrollWrapper.addEventListener("touchend", (e) => {
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
        behavior: "smooth",
      });
    } else {
      // Just snap to closest point if no significant velocity
      const closestSnapPoint = findClosestSnapPoint(endScrollPosition);
      scrollWrapper.scrollTo({
        left: snapPoints[closestSnapPoint],
        behavior: "smooth",
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
  scrollWrapper.addEventListener("scroll", (e) => {
    if (scrollWrapper.scrollLeft === 0) {
      scrollWrapper.scrollLeft = 1;
    } else if (
      scrollWrapper.scrollLeft ===
      scrollWrapper.scrollWidth - scrollWrapper.clientWidth
    ) {
      scrollWrapper.scrollLeft =
        scrollWrapper.scrollWidth - scrollWrapper.clientWidth - 1;
    }
  });
});

// Add spooky theme colors
const spookyThemes = {
  ghost: {
    primary: "#ff6b00",
    secondary: "#9c27b0",
    accent: "#4a0404",
    glow: "rgba(255, 107, 0, 0.5)",
  },
  vampire: {
    primary: "#8b0000",
    secondary: "#4a0404",
    accent: "#ff0000",
    glow: "rgba(139, 0, 0, 0.5)",
  },
  witch: {
    primary: "#6a1b9a",
    secondary: "#4a148c",
    accent: "#9c27b0",
    glow: "rgba(106, 27, 154, 0.5)",
  },
};

// Add ghost follower code
let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let ghostEnabled = true;

class GhostFollow {
  constructor() {
    // Create ghost element
    this.el = document.createElement("div");
    this.el.id = "ghost";
    this.el.innerHTML = `
            <div class="ghost__body">
                <div class="ghost__eyes"></div>
                <div class="ghost__mouth"></div>
            </div>
        `;
    document.body.appendChild(this.el);

    this.mouth = this.el.querySelector(".ghost__mouth");
    this.eyes = this.el.querySelector(".ghost__eyes");
    this.width = 90;
    this.height = 90;

    this.pos = {
      x: window.innerWidth / 2 - this.width / 2,
      y: window.innerHeight / 2 - this.height / 2,
    };

    // Set initial position
    this.el.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            transform: translate(${this.pos.x}px, ${this.pos.y}px) scale(0.8);
            z-index: 9998;
            pointer-events: none;
        `;

    // Movement properties
    this.velocity = { x: 0, y: 0 };
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderRadius = 2;
    this.maxSpeed = 5;
    this.fleeDistance = 200;
    this.fleeFactor = 4;
    this.restThreshold = 500;
    this.isResting = false;
    this.restTimer = 0;
    this.maxRestTime = 100;
    this.chillSpeed = 0.5;

    // Add ghost styles
    const ghostStyle = document.createElement("style");
    ghostStyle.textContent = `
            #ghost {
                transition: transform 0.05s linear;
            }
            .ghost__body {
                width: 60px;
                height: 60px;
                border-radius: 50% 50% 0 0;
                position: relative;
                box-shadow:                     inset 0 0 15px rgba(255, 107, 0, 0.1);
                overflow: visible;
            }
            .ghost__body::after {
                content: '';
                position: absolute;
                bottom: -10px;
                left: 0;
                width: 100%;
                height: 20px;
                background: inherit;
                filter: blur(10px);
                opacity: 0.3;
            }
            .ghost__eyes {
                position: absolute;
                top: 30%;
                left: 50%;
                transform: translateX(-50%);
                width: 32px;
                height: 8px;
                display: flex;
                justify-content: space-between;
                filter: drop-shadow(0 0 5px rgba(255, 107, 0, 0.5));
            }
            .ghost__eyes:before,
            .ghost__eyes:after {
                content: '';
                width: 8px;
                height: 8px;
                background: #000;
                border-radius: 50%;
                position: absolute;
                box-shadow: 
                    inset 0 0 4px rgba(255, 107, 0, 0.5),
                    0 0 8px rgba(0, 0, 0, 0.2);
            }
            .ghost__eyes:before { left: 0; }
            .ghost__eyes:after { right: 0; }
            .ghost__mouth {
                position: absolute;
                bottom: 25%;
                left: 50%;
                transform: translateX(-50%);
                width: 16px;
                height: 8px;
                background: #000;
                border-radius: 50%;
                transition: transform 0.2s ease;
                box-shadow: 
                    inset 0 0 4px rgba(255, 107, 0, 0.5),
                    0 0 8px rgba(0, 0, 0, 0.2);
            }
            .spooky-theme #ghost .ghost__body {
                background: rgba(255, 255, 255, 0.98);
            }
        `;
    document.head.appendChild(ghostStyle);
  }

  wander() {
    this.wanderAngle += (Math.random() - 0.5) * (this.isResting ? 0.2 : 0.5);
    const wanderForce = this.isResting
      ? this.wanderRadius * 0.3
      : this.wanderRadius;
    return {
      x: Math.cos(this.wanderAngle) * wanderForce,
      y: Math.sin(this.wanderAngle) * wanderForce,
    };
  }

  follow() {
    if (!ghostEnabled || !document.body.classList.contains("spooky-theme"))
      return;

    const dist = Math.hypot(mouse.x - this.pos.x, mouse.y - this.pos.y);

    if (dist > this.restThreshold) {
      this.restTimer++;
      if (this.restTimer > this.maxRestTime) this.isResting = true;
    } else {
      this.restTimer = 0;
      this.isResting = false;
    }

    const wanderForce = this.wander();
    let forceX = wanderForce.x;
    let forceY = wanderForce.y;

    if (dist < this.fleeDistance) {
      this.isResting = false;
      const fleeX = this.pos.x - mouse.x;
      const fleeY = this.pos.y - mouse.y;

      const fleeMagnitude = Math.hypot(fleeX, fleeY);
      const fleeStrength = (this.fleeDistance - dist) / this.fleeDistance;

      forceX += (fleeX / fleeMagnitude) * this.fleeFactor * fleeStrength;
      forceY += (fleeY / fleeMagnitude) * this.fleeFactor * fleeStrength;
    }

    const forceFactor = this.isResting ? 0.05 : 0.1;
    this.velocity.x += forceX * forceFactor;
    this.velocity.y += forceY * forceFactor;

    const drag = this.isResting ? 0.92 : 0.95;
    this.velocity.x *= drag;
    this.velocity.y *= drag;

    const currentMaxSpeed = this.isResting ? this.chillSpeed : this.maxSpeed;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > currentMaxSpeed) {
      this.velocity.x = (this.velocity.x / speed) * currentMaxSpeed;
      this.velocity.y = (this.velocity.y / speed) * currentMaxSpeed;
    }

    this.pos.x += this.velocity.x;
    this.pos.y += this.velocity.y;

    const padding = 20;
    const maxX = window.innerWidth - this.width - padding;
    const maxY = window.innerHeight - this.height - padding;

    if (this.pos.x <= padding || this.pos.x >= maxX) {
      this.velocity.x *= -0.5;
      this.pos.x = Math.max(padding, Math.min(maxX, this.pos.x));
      this.wanderAngle = Math.PI - this.wanderAngle;
    }

    if (this.pos.y <= padding || this.pos.y >= maxY) {
      this.velocity.y *= -0.5;
      this.pos.y = Math.max(padding, Math.min(maxY, this.pos.y));
      this.wanderAngle = -this.wanderAngle;
    }

    const velX = this.velocity.x;
    const velY = this.velocity.y;

    const skewX = map(velX, -this.maxSpeed, this.maxSpeed, -30, 30);
    const rotate = map(velX, -this.maxSpeed, this.maxSpeed, -15, 15);
    const scaleY = map(velY, -this.maxSpeed, this.maxSpeed, 0.9, 1.1);
    const scaleEyeX = map(Math.abs(velX), 0, this.maxSpeed, 1, 1.3);
    const scaleEyeY = map(Math.abs(velX), 0, this.maxSpeed, 1, 0.8);
    const scaleMouth = Math.min(
      Math.max(
        map(Math.abs(velX * 1.5), 0, this.maxSpeed, 0.5, 2),
        map(Math.abs(velY * 1.2), 0, this.maxSpeed, 0.5, 1.5)
      ),
      2
    );

    if (dist < this.fleeDistance) {
      const scareIntensity = (this.fleeDistance - dist) / this.fleeDistance;
      this.mouth.style.transform = `translate(${-skewX * 0.5 - 10}px) scale(${
        -scaleMouth * (1 + scareIntensity)
      })`;
    } else {
      this.mouth.style.transform = `translate(${
        -skewX * 0.5 - 10
      }px) scale(${scaleMouth})`;
    }

    this.el.style.transform = `translate(${this.pos.x}px, ${this.pos.y}px) 
             scale(0.8) skew(${skewX}deg) rotate(${rotate}deg) scaleY(${scaleY})`;

    this.eyes.style.transform = `translateX(-50%) scale(${scaleEyeX}, ${scaleEyeY})`;
  }
}

function map(num, in_min, in_max, out_min, out_max) {
  return ((num - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
}

// Track mouse position
["mousemove", "touchstart", "touchmove"].forEach((event) => {
  window.addEventListener(event, (e) => {
    mouse.x = e.clientX || (e.touches ? e.touches[0].pageX : 0);
    mouse.y = e.clientY || (e.touches ? e.touches[0].pageY : 0);
  });
});

// Initialize ghost follower in initSpookyTheme
function initSpookyTheme() {
  // Check if ghost follower already exists and remove it
  const existingGhost = document.getElementById("ghost");
  if (existingGhost) {
    existingGhost.remove();
  }

  // Add spooky theme class if not already present
  if (!document.body.classList.contains("spooky-theme")) {
    document.body.classList.add("spooky-theme");
  }

  // Get hero section for confined particles
  const hero = document.querySelector(".hero");
  if (!hero) return;

  // Create particles container
  const particles = document.createElement("div");
  particles.className = "spooky-particles";
  hero.appendChild(particles);

  // Create ghost particles with more variety
  const numberOfParticles = 15;
  const spookyEmojis = ["👻", "🦇", "🕷️", "🎃", "💀"];
  const particleElements = [];

  // Create particle elements with physics properties
  for (let i = 0; i < numberOfParticles; i++) {
    const particle = document.createElement("div");
    particle.className = "spooky-particle";

    // Initial position within hero section
    const x = Math.random() * (hero.offsetWidth - 30); // 30px for particle size
    const y = Math.random() * (hero.offsetHeight - 30);

    // Random velocity
    const vx = (Math.random() - 0.5) * 2;
    const vy = (Math.random() - 0.5) * 2;

    // Random size and rotation
    const size = 0.7 + Math.random() * 0.6;
    const rotation = Math.random() * 360;

    particle.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            transform: scale(${size}) rotate(${rotation}deg);
            transition: transform 0.3s ease;
        `;

    // Randomly choose emoji
    particle.innerHTML =
      spookyEmojis[Math.floor(Math.random() * spookyEmojis.length)];

    // Store physics properties
    particleElements.push({
      element: particle,
      x,
      y,
      vx,
      vy,
      size,
      rotation,
    });

    particles.appendChild(particle);
  }

  // Animate particles with physics
  let lastTime = performance.now();
  function animateParticles(currentTime) {
    const deltaTime = (currentTime - lastTime) / 16; // Normalize to ~60fps
    lastTime = currentTime;

    const bounds = hero.getBoundingClientRect();

    particleElements.forEach((particle) => {
      // Update position
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;

      // Bounce off edges
      if (particle.x <= 0 || particle.x >= bounds.width - 30) {
        particle.vx *= -1;
        particle.rotation += 180;
      }
      if (particle.y <= 0 || particle.y >= bounds.height - 30) {
        particle.vy *= -1;
        particle.rotation += 180;
      }

      // Apply position and rotation
      particle.element.style.transform = `translate(${particle.x}px, ${particle.y}px) scale(${particle.size}) rotate(${particle.rotation}deg)`;
    });

    if (document.body.classList.contains("spooky-theme")) {
      window.spookyAnimationFrame = requestAnimationFrame(animateParticles);
    }
  }

  requestAnimationFrame(animateParticles);

  // Optimize cursor trail with smooth animation
  const trail = document.createElement("div");
  trail.className = "cursor-trail";
  document.body.appendChild(trail);

  let cursorTimeout;
  let lastX = 0;
  let lastY = 0;
  let currentTheme = spookyThemes.ghost;
  const trailPoints = [];
  const maxPoints = 15;
  const trailLifetime = 500; // milliseconds

  function lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }

  function updateTrail(timestamp) {
    if (!document.body.classList.contains("spooky-theme")) {
      trail.style.opacity = "0";
      return;
    }

    trail.style.opacity = "1";
    const currentTime = timestamp || performance.now();

    // Update points
    for (let i = trailPoints.length - 1; i >= 0; i--) {
      const point = trailPoints[i];
      const age = currentTime - point.timestamp;

      if (age > trailLifetime) {
        trailPoints.splice(i, 1);
        continue;
      }

      // Smooth out the trail
      if (i > 0) {
        const nextPoint = trailPoints[i - 1];
        const t = 0.2;
        point.x = lerp(point.x, nextPoint.x, t);
        point.y = lerp(point.y, nextPoint.y, t);
      }

      // Add slight gravity effect
      point.y += 0.1;
    }

    // Generate gradient
    if (trailPoints.length > 1) {
      const gradients = trailPoints.map((point, index) => {
        const age = currentTime - point.timestamp;
        const life = 1 - age / trailLifetime;
        const size = Math.max(4, 12 * life);
        const alpha = life * 0.5;
        const color = currentTheme.glow.replace("0.5", alpha);
        return `radial-gradient(circle ${size}px at ${point.x}px ${point.y}px, ${color}, transparent)`;
      });

      trail.style.background = gradients.join(", ");
    }

    requestAnimationFrame(updateTrail);
  }

  document.addEventListener("mousemove", (e) => {
    if (!document.body.classList.contains("spooky-theme")) return;

    const currentTime = performance.now();
    const velocity = Math.hypot(e.clientX - lastX, e.clientY - lastY);

    // Add points based on mouse velocity
    if (velocity > 1) {
      trailPoints.unshift({
        x: e.clientX,
        y: e.clientY,
        timestamp: currentTime,
      });

      // Limit number of points
      if (trailPoints.length > maxPoints) {
        trailPoints.pop();
      }
    }

    lastX = e.clientX;
    lastY = e.clientY;

    // Clear hide timeout
    clearTimeout(cursorTimeout);
    trail.style.opacity = "1";

    // Set new hide timeout
    cursorTimeout = setTimeout(() => {
      trail.style.opacity = "0";
    }, 150);
  });

  // Start animation loop
  requestAnimationFrame(updateTrail);

  // Add CSS for improved cursor trail
  const cursorStyle = document.createElement("style");
  cursorStyle.textContent = `
        .cursor-trail {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
            mix-blend-mode: screen;
            transition: opacity 0.15s ease;
        }

        .spooky-theme {
            cursor: none;
        }

        .spooky-theme a,
        .spooky-theme button,
        .spooky-theme [role="button"],
        .spooky-theme .clickable {
            cursor: none;
        }
    `;
  document.head.appendChild(cursorStyle);

  // Remove old cursor trail elements if they exist
  document.querySelectorAll(".cursor-trail").forEach((el, index) => {
    if (index > 0) el.remove();
  });

  // Initialize ghost follower
  const ghost = new GhostFollow();

  function render() {
    if (document.body.classList.contains("spooky-theme")) {
      requestAnimationFrame(render);
      ghost.follow();
    }
  }

  render();

  // Return cleanup function
  const originalCleanup = initSpookyTheme.cleanup || (() => {});
  return () => {
    originalCleanup();
    ghost.el.remove();
    ghostEnabled = false;
  };
}

// Add CSS for optimized cursor trail
const style = document.createElement("style");
style.textContent = `
    .cursor-trail {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    }

    .spooky-particle {
        position: absolute;
        pointer-events: auto;
        z-index: 1000;
        transition: transform 0.3s ease;
        cursor: pointer;
        filter: drop-shadow(0 0 5px rgba(255, 107, 0, 0.5));
        user-select: none;
    }

    .spooky-particles {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
    }
`;
document.head.appendChild(style);

// Add this to your DOMContentLoaded event
document.addEventListener("DOMContentLoaded", function () {
  // Initialize Feather icons
  feather.replace({
    "stroke-width": 2.5,
    width: 16,
    height: 16,
    class: "feather-icon",
  });

  // Theme toggle functionality
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    // Set ghost icon for theme toggle
    const icon = themeToggle.querySelector("i");
    if (!icon) {
      const newIcon = document.createElement("i");
      newIcon.setAttribute("data-feather", "ghost");
      themeToggle.appendChild(newIcon);
    }

    // Re-run feather icons
    feather.replace();

    themeToggle.addEventListener("click", function (e) {
      e.preventDefault();
      document.body.classList.toggle("spooky-theme");

      // Toggle particles and ghost
      const particles = document.querySelector(".spooky-particles");
      const ghost = document.getElementById("ghost");
      const cursorTrail = document.querySelector(".cursor-trail");
      const spookyParticles = document.querySelectorAll(".spooky-particle");

      if (document.body.classList.contains("spooky-theme")) {
        ghostEnabled = true;
        initSpookyTheme();
        // Save theme preference
        localStorage.setItem("theme", "spooky");
      } else {
        // Clean up all spooky elements
        if (particles) particles.remove();
        if (ghost) ghost.remove();
        if (cursorTrail) cursorTrail.remove();
        spookyParticles.forEach((particle) => particle.remove());

        // Reset cursor style
        document.body.style.cursor = "";
        document
          .querySelectorAll('a, button, [role="button"], .clickable')
          .forEach((el) => {
            el.style.cursor = "";
          });

        // Reset ghost state
        ghostEnabled = false;

        // Stop any ongoing animations
        if (window.spookyAnimationFrame) {
          cancelAnimationFrame(window.spookyAnimationFrame);
        }
        // Save theme preference
        localStorage.setItem("theme", "default");
      }
    });
  }

  // Check for saved theme preference
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "spooky") {
    document.body.classList.add("spooky-theme");
    ghostEnabled = true;
    initSpookyTheme();
  }

  // Add enhanced spooky elements
  enhanceSpookyElements();
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

  const countdownEl = document.querySelector(".christmas-countdown");
  if (countdownEl) {
    countdownEl.textContent = `${days}d ${hours}h until Christmas!`;
  }
}

function enhanceSnowfall() {
  const snowflakes = document.querySelectorAll(".snowflake");
  snowflakes.forEach((flake) => {
    flake.addEventListener("mouseover", () => {
      flake.style.animation = "none";
      flake.style.transform = "scale(1.5)";
      setTimeout(() => {
        flake.style.animation = `snowfall ${
          5 + Math.random() * 10
        }s linear infinite`;
      }, 500);
    });
  });
}

// Initialize mobile menu after Feather icons are loaded
// Remove this duplicate event listener
// document.addEventListener('DOMContentLoaded', () => {
//     // First load Feather icons
//     feather.replace({
//         'stroke-width': 2.5,
//         'width': 16,
//         'height': 16,
//         'class': 'feather-icon'
//     }).then(() => {
//         // Then initialize mobile menu
//         const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
//         const navLinks = document.querySelector('.nav-links');
//         const body = document.body;
//         const overlay = document.createElement('div');
//         overlay.classList.add('menu-overlay');
//         document.body.appendChild(overlay);
//
//         function toggleMenu() {
//             navLinks.classList.toggle('active');
//             overlay.classList.toggle('active');
//             body.classList.toggle('menu-open');
//
//             // Update menu icon
//             const menuIcon = mobileMenuBtn.querySelector('[data-feather]');
//             if (menuIcon) {
//                 if (navLinks.classList.contains('active')) {
//                     menuIcon.setAttribute('data-feather', 'x');
//                 } else {
//                     menuIcon.setAttribute('data-feather', 'menu');
//                 }
//                 if (window.feather) {
//                     feather.replace();
//                 }
//             }
//         }
//
//         // Toggle menu on button click
//         mobileMenuBtn.addEventListener('click', (e) => {
//             e.stopPropagation();
//             toggleMenu();
//         });
//
//         // Close menu when clicking overlay
//         overlay.addEventListener('click', toggleMenu);
//
//         // Close menu when clicking a link
//         navLinks.querySelectorAll('a').forEach(link => {
//             link.addEventListener('click', () => {
//                 if (navLinks.classList.contains('active')) {
//                     toggleMenu();
//                 }
//             });
//         });
//     });
// });

// Link preloading functionality
const linkPreloader = {
  // Track which URLs have been preloaded
  preloadedUrls: new Set(),

  // Distance threshold for preloading (in pixels)
  hoverThreshold: 50,

  // Initialize preloading behavior
  init() {
    // Handle mouse movement for proximity preloading
    document.addEventListener("mousemove", (e) => this.handleMouseMove(e));

    // Handle direct link hovers
    document.querySelectorAll("a[href]").forEach((link) => {
      link.addEventListener("mouseenter", () => this.preloadUrl(link.href));
    });
  },

  // Handle mouse movement to check proximity to links
  handleMouseMove(e) {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Get all links that haven't been preloaded yet
    document.querySelectorAll("a[href]").forEach((link) => {
      if (this.preloadedUrls.has(link.href)) return;

      const rect = link.getBoundingClientRect();
      const distance = this.getDistance(
        mouseX,
        mouseY,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );

      if (distance < this.hoverThreshold) {
        this.preloadUrl(link.href);
      }
    });
  },

  // Calculate distance between two points
  getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  },

  // Preload a URL if it's valid and hasn't been preloaded
  preloadUrl(url) {
    // Skip if already preloaded or same origin
    if (this.preloadedUrls.has(url) || url.startsWith("#")) return;

    try {
      const urlObj = new URL(url, window.location.origin);

      // Only preload if it's our domain or specific allowed domains
      if (
        urlObj.hostname === window.location.hostname ||
        urlObj.hostname === "cdn.spookytools.com" ||
        urlObj.hostname === "github.com"
      ) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = url;
        document.head.appendChild(link);

        this.preloadedUrls.add(url);
        console.log("Preloaded:", url);
      }
    } catch (e) {
      console.warn("Invalid URL:", url);
    }
  },
};

// Initialize link preloader when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  linkPreloader.init();
});

async function fetchLatestRelease() {
  const repoOwner = "Spooks4576";
  const repoName = "Ghost_ESP";
  const featuresGrid = document.querySelector(".features-grid");

  if (!featuresGrid) return;

  // Create release card container
  const releaseCard = document.createElement("div");
  releaseCard.className = "latest-release-card";
  releaseCard.id = "latest-release";
  releaseCard.innerHTML =
    '<div class="release-loading">Loading latest release...</div>';
  featuresGrid.appendChild(releaseCard);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`
    );
    if (!response.ok) throw new Error("Failed to fetch release data");

    const release = await response.json();

    // Format date
    const releaseDate = new Date(release.published_at);
    const dateString = releaseDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Create release card content
    releaseCard.innerHTML = `
            <div class="latest-release-header">
                <i data-feather="package"></i>
                <h3>Latest Release: ${release.tag_name}</h3>
            </div>
            <div class="release-content">
                <div class="release-info">
                    <h4>${release.name}</h4>
                    <div class="release-meta">
                        <span><i data-feather="calendar"></i>${dateString}</span>
                        <span><i data-feather="download"></i>${release.assets.reduce(
                          (acc, asset) => acc + asset.download_count,
                          0
                        )} downloads</span>
                    </div>
                    <div class="release-body markdown-content">${marked.parse(
                      release.body
                    )}</div>
                    <a href="${
                      release.html_url
                    }" class="primary-btn" target="_blank">
                        <i data-feather="github"></i>
                        View Release
                    </a>
                </div>
                <div class="release-assets">
                    <h4>Downloads</h4>
                    <div class="asset-list">
                        ${release.assets
                          .slice(0, 3)
                          .map(
                            (asset) => `
                            <a href="${asset.browser_download_url}" class="asset-link" target="_blank">
                                <i data-feather="download-cloud"></i>
                                ${asset.name}
                            </a>
                        `
                          )
                          .join("")}
                        <div class="hidden-assets" style="display: none;">
                            ${release.assets
                              .slice(3)
                              .map(
                                (asset) => `
                                <a href="${asset.browser_download_url}" class="asset-link" target="_blank">
                                    <i data-feather="download-cloud"></i>
                                    ${asset.name}
                                </a>
                            `
                              )
                              .join("")}
                        </div>
                    </div>
                    ${
                      release.assets.length > 3
                        ? `
                        <button class="show-more-btn">
                            <span class="show-more-text">Show More</span>
                            <i data-feather="chevron-down"></i>
                        </button>
                    `
                        : ""
                    }
                </div>
            </div>
        `;

    // Re-initialize Feather icons
    feather.replace();

    // Add show more functionality
    const showMoreBtn = releaseCard.querySelector(".show-more-btn");
    if (showMoreBtn) {
      showMoreBtn.addEventListener("click", () => {
        const hiddenAssets = releaseCard.querySelector(".hidden-assets");
        const btnText = showMoreBtn.querySelector(".show-more-text");
        const btnIcon = showMoreBtn.querySelector("i");

        if (hiddenAssets.style.display === "none") {
          hiddenAssets.style.display = "block";
          btnText.textContent = "Show Less";
          btnIcon.setAttribute("data-feather", "chevron-up");
        } else {
          hiddenAssets.style.display = "none";
          btnText.textContent = "Show More";
          btnIcon.setAttribute("data-feather", "chevron-down");
        }
        feather.replace();
      });
    }
  } catch (error) {
    console.error("Error fetching release:", error);
    releaseCard.innerHTML = `
            <div class="release-error">
                <i data-feather="alert-circle"></i>
                <p>Failed to load latest release data. Please try again later.</p>
            </div>
        `;
    feather.replace();
  }
}

// Add click handler for logo text
document.querySelector(".logo").addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

// Add Konami code easter egg
const konamiCode = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];
let konamiIndex = 0;

document.addEventListener("keydown", function (e) {
  // Check if the key pressed matches the next key in the Konami code
  if (e.key === konamiCode[konamiIndex]) {
    konamiIndex++;

    // If the full code is entered
    if (konamiIndex === konamiCode.length) {
      // Reset the index
      konamiIndex = 0;

      // Add a fun animation effect
      const logo = document.querySelector(".logo");
      logo.style.transition = "transform 0.5s ease";
      logo.style.transform = "rotate(360deg)";

      // After animation, redirect to snake game
      setTimeout(() => {
        window.location.href = "snake.html";
      }, 500);
    }
  } else {
    // Reset if wrong key is pressed
    konamiIndex = 0;
  }
});

// Add logo click counter for alternative easter egg
let logoClickCount = 0;
let logoClickTimer;

document.querySelector(".logo").addEventListener("click", function (e) {
  e.preventDefault();

  logoClickCount++;

  // Clear existing timer
  clearTimeout(logoClickTimer);

  // Set new timer to reset count after 2 seconds
  logoClickTimer = setTimeout(() => {
    logoClickCount = 0;
  }, 2000);

  // If logo is clicked 5 times rapidly
  if (logoClickCount === 5) {
    logoClickCount = 0;
    clearTimeout(logoClickTimer);

    // Add a fun effect
    this.style.transition = "transform 0.5s ease";
    this.style.transform = "rotate(360deg)";

    // After animation, redirect to snake game
    setTimeout(() => {
      window.location.href = "snake.html";
    }, 500);
  }
});

// Add this after initSpookyTheme function
function enhanceSpookyElements() {
  // Add spooky glow to feature cards
  const featureCards = document.querySelectorAll(".feature-card");
  featureCards.forEach((card) => {
    card.addEventListener("mouseover", () => {
      card.style.boxShadow = "0 0 20px rgba(255, 107, 0, 0.3)";
      card.style.transform = "translateY(-10px) scale(1.02)";

      // Add spooky icon glow
      const icon = card.querySelector("i");
      if (icon) {
        icon.style.filter = "drop-shadow(0 0 10px rgba(255, 107, 0, 0.7))";
      }
    });

    card.addEventListener("mouseout", () => {
      card.style.boxShadow = "";
      card.style.transform = "";

      const icon = card.querySelector("i");
      if (icon) {
        icon.style.filter = "";
      }
    });
  });

  // Add spooky hover effect to buttons
  const buttons = document.querySelectorAll(".primary-btn, .secondary-btn");
  buttons.forEach((button) => {
    button.addEventListener("mouseover", () => {
      button.style.transform = "translateY(-3px) scale(1.05)";
      button.style.boxShadow = "0 10px 20px rgba(255, 107, 0, 0.3)";
    });

    button.addEventListener("mouseout", () => {
      button.style.transform = "";
      button.style.boxShadow = "";
    });
  });
}

function initMobileMenu() {
  const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
  const navLinks = document.querySelector(".nav-links");
  const body = document.body;
  const overlay = document.createElement("div");
  overlay.classList.add("menu-overlay");
  document.body.appendChild(overlay);

  function toggleMenu() {
    navLinks.classList.toggle("active");
    overlay.classList.toggle("active");
    body.classList.toggle("menu-open");

    // Update menu icon
    const menuIcon = mobileMenuBtn.querySelector("[data-feather]");
    if (menuIcon) {
      if (navLinks.classList.contains("active")) {
        menuIcon.setAttribute("data-feather", "x");
      } else {
        menuIcon.setAttribute("data-feather", "menu");
      }
      if (window.feather) {
        feather.replace();
      }
    }
  }

  // Toggle menu on button click
  mobileMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Close menu when clicking overlay
  overlay.addEventListener("click", toggleMenu);

  // Close menu when clicking a link
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (navLinks.classList.contains("active")) {
        toggleMenu();
      }
    });
  });
}
