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
  // Allow iframes inside the horizontally-scrollable carousel to be observed
  const scrollWrapper = document.querySelector(".video-scroll-wrapper");

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
    scrollWrapper
      ? { root: scrollWrapper, threshold: 0.25 }
      : { rootMargin: "50px 0px", threshold: 0.25 }
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
      fetchLatestRelease();
      fetchFlipperRelease();
    });
  } else {
    setTimeout(() => {
      initNonCriticalFeatures();
      fetchLatestRelease();
      fetchFlipperRelease();
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

  // Revival Notice Modal Logic
  const modal = document.getElementById("revival-modal");
  const closeBtn = document.querySelector(".modal .close-button");
  const visitedKey = 'ghostEspRevivalNoticeLastSeen'; // Changed key name for clarity
  const targetDate = new Date('2025-04-21T00:00:00Z').getTime(); // Target date timestamp (UTC)
  const now = new Date().getTime(); // Current timestamp

  // Get the timestamp of the last visit when the notice was seen
  const lastSeenTimestamp = localStorage.getItem(visitedKey);

  // Determine if the modal should be shown
  let shouldShowModal = false;
  if (!lastSeenTimestamp) {
      // Never seen before
      shouldShowModal = true;
  } else {
      // Seen before, check if it was before the target date
      if (parseInt(lastSeenTimestamp, 10) < targetDate) {
          shouldShowModal = true;
      }
  }

  // Show the modal if needed and update the timestamp
  if (shouldShowModal) {
    if (modal) {
      modal.style.display = "block";
      // Update the last seen timestamp to now
      localStorage.setItem(visitedKey, now.toString());
    }
  }

  // Close button functionality
  if (closeBtn) {
    closeBtn.onclick = function() {
      if (modal) {
        modal.style.display = "none";
      }
    }
  }

  // Close modal if user clicks outside of the modal content
  window.onclick = function(event) {
    if (event.target == modal) {
        if (modal) {
            modal.style.display = "none";
        }
    }
  }

  // Existing video scroll functionality (ensure it's placed after DOM elements are defined)
  const scrollWrapper = document.querySelector(".video-scroll-wrapper");
  const scroll = document.querySelector(".video-scroll");
  const leftBtn = document.querySelector(".scroll-button.left");
  const rightBtn = document.querySelector(".scroll-button.right");

  // Check if elements exist before adding listeners
  if (scrollWrapper && scroll && leftBtn && rightBtn) {
      const cardWidth = document.querySelector(".video-card")?.offsetWidth + 32 || 332; // Default width + gap

      function updateButtons() {
          if (!scrollWrapper || !scroll) return; // Guard clause
          const scrollLeft = scrollWrapper.scrollLeft;
          const scrollWidth = scroll.scrollWidth;
          const clientWidth = scrollWrapper.clientWidth;

          leftBtn.style.opacity = scrollLeft <= 1 ? "0.3" : "1"; // Use 1 to avoid floating point issues
          leftBtn.style.cursor = scrollLeft <= 1 ? "default" : "pointer";

          // Check if scrollWidth is significantly larger than clientWidth before enabling right button
          const isScrollable = scrollWidth > clientWidth + 1;
          rightBtn.style.opacity = !isScrollable || scrollLeft >= scrollWidth - clientWidth -1 ? "0.3" : "1";
          rightBtn.style.cursor = !isScrollable || scrollLeft >= scrollWidth - clientWidth -1 ? "default" : "pointer";
      }

      leftBtn.addEventListener("click", () => {
          if (scrollWrapper.scrollLeft > 0) {
              scrollWrapper.scrollBy({
                  left: -cardWidth,
                  behavior: "smooth",
              });
          }
      });

      rightBtn.addEventListener("click", () => {
          if (scrollWrapper.scrollLeft < scroll.scrollWidth - scrollWrapper.clientWidth) {
              scrollWrapper.scrollBy({
                  left: cardWidth,
                  behavior: "smooth",
              });
          }
      });

      scrollWrapper.addEventListener("scroll", debounce(updateButtons, 50)); // Debounce update

      // Initial button state and resize handling
       updateButtons(); // Call initially
       window.addEventListener('resize', debounce(updateButtons, 100)); // Update on resize
  }

  // Scroll arrow functionality
  const scrollArrow = document.querySelector(".scroll-arrow");
  if (scrollArrow) {
      scrollArrow.addEventListener("click", function () {
          window.scrollTo({
              top: window.innerHeight * 0.9, // Scroll slightly less than full viewport height
              behavior: "smooth",
          });
      });
  }
});

// Debounce function
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

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
document.addEventListener('DOMContentLoaded', () => {
    // First load Feather icons
    feather.replace({
        'stroke-width': 2.5,
        'width': 16,
        'height': 16,
        'class': 'feather-icon'
    }).then(() => {
        // Then initialize mobile menu
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        const navLinks = document.querySelector('.nav-links');
        const body = document.body;
        const overlay = document.createElement('div');
        overlay.classList.add('menu-overlay');
        document.body.appendChild(overlay);

        function toggleMenu() {
            navLinks.classList.toggle('active');
            overlay.classList.toggle('active');
            body.classList.toggle('menu-open');

            const menuIcon = mobileMenuBtn.querySelector('.feather-menu');
            const closeIcon = mobileMenuBtn.querySelector('.feather-x');
            
            if (navLinks.classList.contains('active')) {
                // Show close icon, hide menu icon
                menuIcon.style.display = 'none';
                if (!closeIcon) {
                    const closeIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    closeIconSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    closeIconSvg.setAttribute('width', '24');
                    closeIconSvg.setAttribute('height', '24');
                    closeIconSvg.setAttribute('viewBox', '0 0 24 24');
                    closeIconSvg.setAttribute('fill', 'none');
                    closeIconSvg.setAttribute('stroke', 'currentColor');
                    closeIconSvg.setAttribute('stroke-width', '2');
                    closeIconSvg.setAttribute('stroke-linecap', 'round');
                    closeIconSvg.setAttribute('stroke-linejoin', 'round');
                    closeIconSvg.classList.add('feather', 'feather-x');
                    
                    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line1.setAttribute('x1', '18');
                    line1.setAttribute('y1', '6');
                    line1.setAttribute('x2', '6');
                    line1.setAttribute('y2', '18');
                    
                    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line2.setAttribute('x1', '6');
                    line2.setAttribute('y1', '6');
                    line2.setAttribute('x2', '18');
                    line2.setAttribute('y2', '18');
                    
                    closeIconSvg.appendChild(line1);
                    closeIconSvg.appendChild(line2);
                    mobileMenuBtn.appendChild(closeIconSvg);
                } else {
                    closeIcon.style.display = 'block';
                }
            } else {
                // Show menu icon, hide close icon
                menuIcon.style.display = 'block';
                if (closeIcon) {
                    closeIcon.style.display = 'none';
                }
            }
        }

        // Toggle menu on button click
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });

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
    });
});

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
  const repoOwner = "jaylikesbunda";
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
  const menuOverlay = document.querySelector(".menu-overlay");
  const body = document.body;

  function toggleMenu() {
    navLinks.classList.toggle("active");
    menuOverlay.classList.toggle("active");
    body.classList.toggle("menu-open");
    
    const menuIcon = mobileMenuBtn.querySelector(".feather-menu");
    const closeIcon = mobileMenuBtn.querySelector(".feather-x");
    
    if (navLinks.classList.contains("active")) {
      // Show close icon, hide menu icon
      menuIcon.style.display = "none";
      if (!closeIcon) {
        const closeIconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        closeIconSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        closeIconSvg.setAttribute("width", "24");
        closeIconSvg.setAttribute("height", "24");
        closeIconSvg.setAttribute("viewBox", "0 0 24 24");
        closeIconSvg.setAttribute("fill", "none");
        closeIconSvg.setAttribute("stroke", "currentColor");
        closeIconSvg.setAttribute("stroke-width", "2");
        closeIconSvg.setAttribute("stroke-linecap", "round");
        closeIconSvg.setAttribute("stroke-linejoin", "round");
        closeIconSvg.classList.add("feather", "feather-x");
        
        const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line1.setAttribute("x1", "18");
        line1.setAttribute("y1", "6");
        line1.setAttribute("x2", "6");
        line1.setAttribute("y2", "18");
        
        const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line2.setAttribute("x1", "6");
        line2.setAttribute("y1", "6");
        line2.setAttribute("x2", "18");
        line2.setAttribute("y2", "18");
        
        closeIconSvg.appendChild(line1);
        closeIconSvg.appendChild(line2);
        mobileMenuBtn.appendChild(closeIconSvg);
      } else {
        closeIcon.style.display = "block";
      }
    } else {
      // Show menu icon, hide close icon
      menuIcon.style.display = "block";
      if (closeIcon) {
        closeIcon.style.display = "none";
      }
    }
  }

  // Toggle menu on button click
  mobileMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Close menu when clicking overlay
  menuOverlay.addEventListener("click", toggleMenu);

  // Close menu when clicking a link
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (navLinks.classList.contains("active")) {
        toggleMenu();
      }
    });
  });

  // Close menu on escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navLinks.classList.contains("active")) {
      toggleMenu();
    }
  });
}

async function fetchFlipperRelease() {
  const repoOwner = "jaylikesbunda";
  const repoName = "ghost_esp_app";
  const flipperCard = document.querySelector(".flipper-card");

  if (!flipperCard) return;

  // Add loader to existing card
  const loader = document.createElement('div');
  loader.className = 'release-loading';
  loader.innerHTML = `<i data-feather="refresh-cw" class="spin"></i> Loading Flipper release...`;
  flipperCard.insertBefore(loader, flipperCard.querySelector('.download-options'));

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`
    );
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const release = await response.json();
    const releaseDate = new Date(release.published_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    // Update existing card elements
    const versionBadge = `<span class="version-badge" data-aos="zoom-in">${release.tag_name}</span>`;
    flipperCard.querySelector('h3').innerHTML = `Ghost ESP for Flipper Zero ${versionBadge}`;
    
    const metaHTML = `
      <div class="release-meta" data-aos="fade-up">
        <span><i data-feather="calendar"></i>${releaseDate}</span>
        <span><i data-feather="download"></i>${release.assets.reduce((acc, asset) => acc + asset.download_count, 0)} installs</span>
      </div>
      <div class="release-notes" data-aos="fade-up">
        ${marked.parse(release.body.substring(0, 200) + '...')}
        <a href="${release.html_url}" class="release-link">View full release notes</a>
      </div>
    `;

    // Replace loader with dynamic content
    flipperCard.replaceChild(createHtmlElement(metaHTML), loader);
    
    // Update download button with latest asset
    const fapAsset = release.assets.find(a => a.name.endsWith('.fap'));
    if(fapAsset) {
      flipperCard.querySelector('.download-btn.primary-btn').href = fapAsset.browser_download_url;
    }

    feather.replace();
    AOS.refresh(); // Refresh animations for new elements

  } catch (error) {
    console.error("Error fetching Flipper release:", error);
    loader.innerHTML = `
      <div class="release-error">
        <i data-feather="alert-triangle"></i>
        <p>Failed to load release data. Try refreshing!</p>
      </div>
    `;
    feather.replace();
  }
}

// Helper function to convert HTML string to DOM element
function createHtmlElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

// --- Language Switcher --- //
const translations = {
  en: {
    nav_features: "Features",
    nav_compatibility: "Compatibility",
    nav_get_started: "Get Started",
    nav_flipper_app: "Flipper App",
    nav_serial_console: "Serial Console",
    nav_merch: "Merch",
    nav_language: "Language",
    hero_get_started: "Get Started",
    hero_latest_release: "Latest Release",
    hero_documentation: "Documentation",
    features_heading: "Key Features",
    feature_wifi_title: "WiFi Analysis",
    feature_wifi_desc: "Advanced scanning of access points and stations with OUI matching and real-time monitoring",
    feature_packet_capture_title: "Packet Capture",
    feature_packet_capture_desc: "Capture probe requests, beacons, deauth packets, WPS, EAPOL and raw WiFi packets with PCAP support",
    feature_beacon_ops_title: "Beacon Operations",
    feature_beacon_ops_desc: "Generate custom beacon frames with random, rickroll, or AP list modes for network testing",
    feature_ble_toolkit_title: "BLE Toolkit",
    feature_ble_toolkit_desc: "Scan for Flipper devices, detect BLE spam, track AirTags, and capture raw BLE packets",
    feature_wardriving_title: "Wardriving",
    feature_wardriving_desc: "GPS-enabled WiFi and BLE wardriving with CSV logging for network mapping",
    feature_evil_portal_title: "Evil Portal",
    feature_evil_portal_desc: "Create customizable captive portals with online/offline modes and domain spoofing",
    feature_network_tools_title: "Network Tools",
    feature_network_tools_desc: "DIAL/Chromecast control, network printer access, and TP-Link device management",
    feature_security_testing_title: "Security Testing",
    feature_security_testing_desc: "WPS scanning, and skimmer detection capabilities and more",
    feature_display_features_title: "Display Features",
    feature_display_features_desc: "Built-in games, music visualizer, and RGB rave mode for supported display boards",
    video_heading: "See Ghost ESP in Action",
    video1_title: "GhostESP Overview",
    video1_desc: "Comprehensive overview of GhostESP features including WebUI, Evil Portal, Rave mode, and network printing capabilities",
    video2_title: "Deauth Demo",
    video2_desc: "Demonstration of GhostESP and Flipper Zero deauthenticating a spy camera from a 2.4GHz WiFi network",
    video3_title: "Promo Trailer",
    video3_desc: "Short promotional trailer showcasing GhostESP features",
    video4_title: "T-Watch S3 Tutorial",
    video4_desc: "How to get the T-Watch S3 into bootloader mode and flash GhostESP",
    video5_title: "Mobile Flashing Tutorial",
    video5_desc: "Flash Ghost ESP on ESP32-C3 SuperMini using just your phone",
    compatibility_heading: "Supported Hardware",
    compatibility_display_heading: "Display-Enabled Boards",
    compatibility_cyd_title: "CYD Boards",
    compatibility_cyd_note: "Compatible with 2.8\" ESP32-2432S028",
    compatibility_7inch_title: "7-Inch Displays",
    compatibility_7inch_note: "Both using ESP32-S3",
    compatibility_other_display_title: "Other Display Boards",
    compatibility_generic_heading: "Generic Boards",
    compatibility_esp_models_title: "ESP32 Models",
    compatibility_custom_builds_title: "Custom Builds",
    compatibility_custom_item1: "Create your own build",
    compatibility_custom_item2: "Customize features (more coming soon!)",
    compatibility_custom_item3: "Build for your specific hardware",
    compatibility_custom_link: "View Build Guide →",
    getting_started_heading: "Getting Started",
    getting_started_step1_title: "Flash Your Device",
    getting_started_step1_desc: "Visit the Espresso Flash Web Flasher",
    getting_started_step1_bootloader: "Bootloader Mode:",
    getting_started_step1_boot1: "Hold BOOT button",
    getting_started_step1_boot2: "Connect USB cable",
    getting_started_step1_boot3: "Release BOOT after connection",
    getting_started_step2_title: "Basic Commands",
    getting_started_step2_cmd1: "<code>scanap</code> - Scan WiFi networks",
    getting_started_step2_cmd2: "<code>list -a</code> - List found networks",
    getting_started_step2_cmd3: "<code>scanlocal</code> - Scan local network",
    getting_started_step2_cmd4: "<code>help</code> - Show all commands",
    getting_started_step3_title: "Touch Navigation",
    getting_started_step3_nav1: "Top Half: Move Up",
    getting_started_step3_nav2: "Bottom Half: Move Down",
    getting_started_step3_nav3: "Middle: Select Item",
    getting_started_step3_nav4: "Main Menu: Direct Touch",
    getting_started_step4_title: "Need Help?",
    getting_started_step4_desc: "Join our Discord Community for:",
    getting_started_step4_help1: "Live Support",
    getting_started_step4_help2: "Troubleshooting",
    getting_started_step4_help3: "Latest Updates",
    getting_started_step4_help4: "Community Tips",
    flipper_heading: "Flipper Zero App",
    flipper_card_title: "Ghost ESP for Flipper Zero",
    flipper_card_desc: "Control your Ghost ESP directly from your Flipper Zero with our official companion app.",
    flipper_download_fap: "Download Latest FAP",
    flipper_view_source: "View Source",
    flipper_app_features_title: "App Features:",
    flipper_feature1: "WiFi Operations",
    flipper_feature2: "BLE Controls",
    flipper_feature3: "GPS Functions",
    flipper_feature4: "Device Configuration",
    merch_heading: "Limited Official Store",
    merch_desc: "Exclusive Ghost ESP apparel and accessories",
    merch_feature1: "Quality Gear",
    merch_feature2: "Worldwide Shipping",
    merch_feature3: "Secure Payment",
    merch_visit_store: "Visit Store",
    footer_developed_by: "Site Developed by Jay Candel",
    footer_support: "Support the Project",
  },
  de: {
    nav_features: "Funktionen",
    nav_compatibility: "Kompatibilität",
    nav_get_started: "Loslegen",
    nav_flipper_app: "Flipper App",
    nav_serial_console: "Serielle Konsole",
    nav_merch: "Merch",
    nav_language: "Sprache",
    hero_get_started: "Loslegen",
    hero_latest_release: "Neueste Version",
    hero_documentation: "Dokumentation",
    features_heading: "Hauptfunktionen",
    feature_wifi_title: "WLAN-Analyse",
    feature_wifi_desc: "Erweitertes Scannen von Zugangspunkten und Stationen mit OUI-Abgleich und Echtzeitüberwachung",
    feature_packet_capture_title: "Paketmitschnitt",
    feature_packet_capture_desc: "Erfassen von Probe Requests, Beacons, Deauth-Paketen, WPS, EAPOL und rohen WLAN-Paketen mit PCAP-Unterstützung",
    feature_beacon_ops_title: "Beacon-Operationen",
    feature_beacon_ops_desc: "Generieren Sie benutzerdefinierte Beacon-Frames mit Zufalls-, Rickroll- oder AP-Listenmodi für Netzwerktests",
    feature_ble_toolkit_title: "BLE-Toolkit",
    feature_ble_toolkit_desc: "Suchen Sie nach Flipper-Geräten, erkennen Sie BLE-Spam, verfolgen Sie AirTags und erfassen Sie rohe BLE-Pakete",
    feature_wardriving_title: "Wardriving",
    feature_wardriving_desc: "GPS-fähiges WLAN- und BLE-Wardriving mit CSV-Protokollierung zur Netzwerkzuordnung",
    feature_evil_portal_title: "Evil Portal",
    feature_evil_portal_desc: "Erstellen Sie anpassbare Captive Portals mit Online-/Offline-Modi und Domain-Spoofing",
    feature_network_tools_title: "Netzwerk-Tools",
    feature_network_tools_desc: "DIAL/Chromecast-Steuerung, Zugriff auf Netzwerkdrucker und Verwaltung von TP-Link-Geräten",
    feature_security_testing_title: "Sicherheitstests",
    feature_security_testing_desc: "WPS-Scanning, Skimmer-Erkennung und mehr",
    feature_display_features_title: "Anzeigefunktionen",
    feature_display_features_desc: "Integrierte Spiele, Musikvisualisierer und RGB-Rave-Modus für unterstützte Anzeigeboards",
    video_heading: "Ghost ESP in Aktion sehen",
    video1_title: "GhostESP Überblick",
    video1_desc: "Umfassender Überblick über die GhostESP-Funktionen einschließlich WebUI, Evil Portal, Rave-Modus und Netzwerkdruckfunktionen",
    video2_title: "Deauth-Demo",
    video2_desc: "Demonstration der Deauthentifizierung einer Spionagekamera von einem 2,4-GHz-WLAN-Netzwerk durch GhostESP und Flipper Zero",
    video3_title: "Promo-Trailer",
    video3_desc: "Kurzer Werbe-Trailer, der GhostESP-Funktionen vorstellt",
    video4_title: "T-Watch S3 Tutorial",
    video4_desc: "So versetzen Sie die T-Watch S3 in den Bootloader-Modus und flashen GhostESP",
    video5_title: "Mobiles Flashing-Tutorial",
    video5_desc: "Flashen Sie Ghost ESP auf dem ESP32-C3 SuperMini nur mit Ihrem Telefon",
    compatibility_heading: "Unterstützte Hardware",
    compatibility_display_heading: "Boards mit Display",
    compatibility_cyd_title: "CYD-Boards",
    compatibility_cyd_note: "Kompatibel mit 2.8\" ESP32-2432S028",
    compatibility_7inch_title: "7-Zoll-Displays",
    compatibility_7inch_note: "Beide verwenden ESP32-S3",
    compatibility_other_display_title: "Andere Display-Boards",
    compatibility_generic_heading: "Generische Boards",
    compatibility_esp_models_title: "ESP32-Modelle",
    compatibility_custom_builds_title: "Benutzerdefinierte Builds",
    compatibility_custom_item1: "Erstellen Sie Ihren eigenen Build",
    compatibility_custom_item2: "Passen Sie Funktionen an (mehr in Kürze!)",
    compatibility_custom_item3: "Erstellen Sie für Ihre spezifische Hardware",
    compatibility_custom_link: "Build-Anleitung anzeigen →",
    getting_started_heading: "Loslegen",
    getting_started_step1_title: "Flashen Sie Ihr Gerät",
    getting_started_step1_desc: "Besuchen Sie den Espresso Flash Web Flasher",
    getting_started_step1_bootloader: "Bootloader-Modus:",
    getting_started_step1_boot1: "BOOT-Taste gedrückt halten",
    getting_started_step1_boot2: "USB-Kabel anschließen",
    getting_started_step1_boot3: "BOOT nach Verbindung loslassen",
    getting_started_step2_title: "Grundlegende Befehle",
    getting_started_step2_cmd1: "<code>scanap</code> - WLAN-Netzwerke scannen",
    getting_started_step2_cmd2: "<code>list -a</code> - Gefundene Netzwerke auflisten",
    getting_started_step2_cmd3: "<code>scanlocal</code> - Lokales Netzwerk scannen",
    getting_started_step2_cmd4: "<code>help</code> - Alle Befehle anzeigen",
    getting_started_step3_title: "Touch-Navigation",
    getting_started_step3_nav1: "Obere Hälfte: Nach oben",
    getting_started_step3_nav2: "Untere Hälfte: Nach unten",
    getting_started_step3_nav3: "Mitte: Element auswählen",
    getting_started_step3_nav4: "Hauptmenü: Direkte Berührung",
    getting_started_step4_title: "Benötigen Sie Hilfe?",
    getting_started_step4_desc: "Treten Sie unserer Discord-Community bei für:",
    getting_started_step4_help1: "Live-Support",
    getting_started_step4_help2: "Fehlerbehebung",
    getting_started_step4_help3: "Neueste Updates",
    getting_started_step4_help4: "Community-Tipps",
    flipper_heading: "Flipper Zero App",
    flipper_card_title: "Ghost ESP für Flipper Zero",
    flipper_card_desc: "Steuern Sie Ihren Ghost ESP direkt von Ihrem Flipper Zero mit unserer offiziellen Begleit-App.",
    flipper_download_fap: "Neueste FAP herunterladen",
    flipper_view_source: "Quelle anzeigen",
    flipper_app_features_title: "App-Funktionen:",
    flipper_feature1: "WLAN-Operationen",
    flipper_feature2: "BLE-Steuerung",
    flipper_feature3: "GPS-Funktionen",
    flipper_feature4: "Gerätekonfiguration",
    merch_heading: "Limitierter offizieller Shop",
    merch_desc: "Exklusive Ghost ESP Bekleidung und Accessoires",
    merch_feature1: "Qualitätsausrüstung",
    merch_feature2: "Weltweiter Versand",
    merch_feature3: "Sichere Zahlung",
    merch_visit_store: "Shop besuchen",
    footer_developed_by: "Seite entwickelt von Jay Candel",
    footer_support: "Unterstütze das Projekt",
  },
};

const languageToggleButton = document.getElementById('language-toggle-btn');
const languageDropdown = document.getElementById('language-dropdown');
const languageButtons = languageDropdown.querySelectorAll('button[data-lang]');

function setLanguage(lang) {
  localStorage.setItem('preferredLanguage', lang);
  document.documentElement.lang = lang; // Set lang attribute on <html>

  document.querySelectorAll('[data-lang-key]').forEach(element => {
    const key = element.getAttribute('data-lang-key');
    if (translations[lang] && translations[lang][key]) {
      element.textContent = translations[lang][key];
    }
  });

  // Update language toggle button text if needed (e.g., show current lang)
  // const currentLangDisplay = languageToggleButton.querySelector('.menu-label');
  // if (currentLangDisplay) currentLangDisplay.textContent = lang.toUpperCase();

  languageDropdown.classList.remove('show');
  languageToggleButton.classList.remove('open'); // Rotate arrow back
}

languageToggleButton.addEventListener('click', (event) => {
  event.stopPropagation(); // Prevent click from closing immediately
  languageDropdown.classList.toggle('show');
  languageToggleButton.classList.toggle('open'); // Rotate arrow
});

languageButtons.forEach(button => {
  button.addEventListener('click', () => {
    const selectedLang = button.getAttribute('data-lang');
    setLanguage(selectedLang);
  });
});

// Close dropdown if clicked outside
document.addEventListener('click', (event) => {
  if (!languageToggleButton.contains(event.target) && !languageDropdown.contains(event.target)) {
    languageDropdown.classList.remove('show');
    languageToggleButton.classList.remove('open');
  }
});

// Load preferred language or default to 'en'
const preferredLanguage = localStorage.getItem('preferredLanguage') || 'en';
setLanguage(preferredLanguage);

// --- End Language Switcher --- //
