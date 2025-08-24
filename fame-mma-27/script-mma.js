// ========================================
// FAME MMA 27: KINGDOM - Interactive Landing Page
// Advanced JavaScript for MMA Event Experience
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🥊 FAME MMA 27: KINGDOM - Landing Page Loading...');
    
    // Initialize all components
    initializeCountdown();
    initializeHeroAnimations();
    initializeTicketSystem();
    initializeScrollAnimations();
    initializeMobileFeatures();
    initializeCTAButtons();
    initializeHypeElements();
    
    console.log('🔥 FAME MMA 27 - All systems ready for battle!');
});

// ========================================
// Event Configuration
// ========================================
const EVENT_CONFIG = {
    eventDate: new Date('2025-09-06T19:30:00+02:00'), // September 6, 2025, 19:30 CET
    venue: 'PreZero Arena Gliwice',
    mainEvent: 'Soldić vs Adamek',
    coMainEvent: 'Lexy vs Sheeya',
    ticketPrices: {
        trybuny: 183,
        poziom1: 450,
        vip: 1500,
        ppvStandard: 49.99,
        ppvPremium: 54.99
    },
    socialStats: {
        viewers: 47892,
        subscribers: 1100000,
        trending: '#1 TRENDING'
    }
};

// ========================================
// Countdown Timer
// ========================================
function initializeCountdown() {
    const countdownTimer = document.getElementById('countdown-timer');
    const finalCountdown = document.getElementById('final-countdown');
    
    if (!countdownTimer) return;
    
    function updateCountdown() {
        const now = new Date().getTime();
        const eventTime = EVENT_CONFIG.eventDate.getTime();
        const timeLeft = eventTime - now;
        
        if (timeLeft > 0) {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            
            // Update countdown displays
            document.getElementById('days').textContent = String(days).padStart(2, '0');
            document.getElementById('hours').textContent = String(hours).padStart(2, '0');
            document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
            document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
            
            // Update final countdown
            if (finalCountdown) {
                finalCountdown.textContent = days;
            }
            
            // Add urgency animations
            if (days <= 7) {
                countdownTimer.classList.add('animate-fire');
            }
            if (days <= 3) {
                countdownTimer.classList.add('animate-gold');
            }
        } else {
            // Event has started
            countdownTimer.innerHTML = `
                <div class="event-live">
                    <div class="live-indicator">🔴 NA ŻYWO</div>
                    <div class="live-text">WALKA TRWA!</div>
                </div>
            `;
        }
    }
    
    // Update countdown every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
    
    console.log('⏰ Countdown timer initialized');
}

// ========================================
// Hero Animations
// ========================================
function initializeHeroAnimations() {
    // Animate hero elements on load
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.opacity = '0';
        heroContent.style.transform = 'translateY(50px)';
        
        setTimeout(() => {
            heroContent.style.transition = 'all 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
            heroContent.style.opacity = '1';
            heroContent.style.transform = 'translateY(0)';
        }, 300);
    }
    
    // Animate fighter cards
    const fighterCards = document.querySelectorAll('.fighter-card');
    fighterCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        }, 800 + (index * 200));
    });
    
    // VS Circle animation
    const vsCircle = document.querySelector('.vs-circle');
    if (vsCircle) {
        vsCircle.addEventListener('mouseenter', () => {
            vsCircle.style.transform = 'scale(1.1) rotate(5deg)';
        });
        
        vsCircle.addEventListener('mouseleave', () => {
            vsCircle.style.transform = 'scale(1) rotate(0deg)';
        });
    }
    
    // Hype stats counter animation
    animateHypeStats();
    
    console.log('🎬 Hero animations initialized');
}

function animateHypeStats() {
    const hypeStats = document.querySelectorAll('.hype-number');
    
    hypeStats.forEach(stat => {
        const finalValue = stat.textContent;
        const isNumber = !isNaN(parseFloat(finalValue.replace(/[^0-9.]/g, '')));
        
        if (isNumber) {
            const numericValue = parseFloat(finalValue.replace(/[^0-9.]/g, ''));
            const suffix = finalValue.replace(/[0-9.]/g, '');
            let current = 0;
            const increment = numericValue / 50;
            
            stat.textContent = '0' + suffix;
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= numericValue) {
                    current = numericValue;
                    clearInterval(timer);
                }
                
                if (numericValue >= 1000000) {
                    stat.textContent = (current / 1000000).toFixed(1) + 'M';
                } else if (numericValue >= 1000) {
                    stat.textContent = (current / 1000).toFixed(1) + 'K';
                } else {
                    stat.textContent = Math.floor(current).toLocaleString() + suffix;
                }
            }, 50);
        }
    });
}

// ========================================
// Ticket System
// ========================================
function initializeTicketSystem() {
    // Simulate ticket availability updates
    updateTicketAvailability();
    setInterval(updateTicketAvailability, 30000); // Update every 30 seconds
    
    // Add ticket selection interactions
    const ticketOptions = document.querySelectorAll('.ticket-option');
    ticketOptions.forEach(option => {
        option.addEventListener('click', () => {
            selectTicketOption(option);
        });
    });
    
    console.log('🎫 Ticket system initialized');
}

function updateTicketAvailability() {
    const availabilityUpdates = [
        { selector: '.live-tickets .option-status.limited', text: `OSTATNIE ${Math.floor(Math.random() * 50 + 10)} MIEJSC` },
        { selector: '.ppv-tickets .hype-number', text: `${Math.floor(Math.random() * 1000) + 47000}` }
    ];
    
    availabilityUpdates.forEach(update => {
        const element = document.querySelector(update.selector);
        if (element) {
            element.textContent = update.text;
            element.classList.add('animate-fire');
            setTimeout(() => element.classList.remove('animate-fire'), 2000);
        }
    });
}

function selectTicketOption(option) {
    // Remove previous selections
    document.querySelectorAll('.ticket-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Mark current selection
    option.classList.add('selected');
    
    // Add selection animation
    option.style.transform = 'scale(0.98)';
    setTimeout(() => {
        option.style.transform = 'scale(1)';
    }, 150);
    
    // Show selection feedback
    showTicketFeedback(option);
}

function showTicketFeedback(option) {
    const optionName = option.querySelector('.option-name').textContent;
    const optionPrice = option.querySelector('.option-price').textContent;
    
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.className = 'ticket-feedback';
    feedback.innerHTML = `
        <div class="feedback-content">
            ✅ ${optionName} wybrane - ${optionPrice}
        </div>
    `;
    
    feedback.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--victory-gradient);
        color: var(--mma-black);
        padding: 16px 24px;
        border-radius: 12px;
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 600;
        z-index: 2000;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        opacity: 0;
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(feedback);
    
    // Animate in
    setTimeout(() => {
        feedback.style.opacity = '1';
        feedback.style.transform = 'translate(-50%, -50%) scale(1.05)';
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
        feedback.style.opacity = '0';
        feedback.style.transform = 'translate(-50%, -50%) scale(0.95)';
        setTimeout(() => document.body.removeChild(feedback), 300);
    }, 2000);
}

// ========================================
// Scroll Animations
// ======================================== 
function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                
                // Special animations for specific elements
                if (entry.target.classList.contains('fight-item')) {
                    animateFightCard(entry.target);
                } else if (entry.target.classList.contains('ticket-category')) {
                    animateTicketCard(entry.target);
                }
            }
        });
    }, observerOptions);
    
    // Observe all animatable elements
    const animatableElements = document.querySelectorAll(`
        .fight-item,
        .ticket-category,
        .hype-stat-big,
        .final-cta,
        .special-offer
    `);
    
    animatableElements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(40px)';
        element.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        observer.observe(element);
    });
    
    // Add CSS for animate-in class
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
    
    console.log('🎯 Scroll animations initialized');
}

function animateFightCard(card) {
    const fighters = card.querySelectorAll('.fighter-name-simple');
    fighters.forEach((fighter, index) => {
        setTimeout(() => {
            fighter.style.color = 'var(--victory-gold)';
            fighter.style.transform = 'scale(1.05)';
            setTimeout(() => {
                fighter.style.color = '';
                fighter.style.transform = '';
            }, 500);
        }, index * 200);
    });
}

function animateTicketCard(card) {
    const options = card.querySelectorAll('.ticket-option');
    options.forEach((option, index) => {
        setTimeout(() => {
            option.style.transform = 'translateX(-10px)';
            option.style.borderColor = 'var(--victory-gold)';
            setTimeout(() => {
                option.style.transform = '';
                option.style.borderColor = '';
            }, 300);
        }, index * 100);
    });
}

// ========================================
// Mobile Features
// ========================================
function initializeMobileFeatures() {
    // Show/hide floating CTA based on scroll
    const floatingCta = document.getElementById('floating-cta');
    const heroCta = document.querySelector('.hero-cta');
    
    if (floatingCta && heroCta) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (window.innerWidth <= 768) {
                    floatingCta.style.display = entry.isIntersecting ? 'none' : 'block';
                }
            });
        });
        
        observer.observe(heroCta);
    }
    
    // Mobile-specific touch interactions
    if ('ontouchstart' in window) {
        addTouchInteractions();
    }
    
    console.log('📱 Mobile features initialized');
}

function addTouchInteractions() {
    // Fighter card touch interactions
    const fighterCards = document.querySelectorAll('.fighter-card');
    fighterCards.forEach(card => {
        card.addEventListener('touchstart', () => {
            card.style.transform = 'translateY(-4px) scale(1.02)';
        }, { passive: true });
        
        card.addEventListener('touchend', () => {
            setTimeout(() => {
                card.style.transform = '';
            }, 150);
        }, { passive: true });
    });
    
    // Ticket option touch feedback
    const ticketOptions = document.querySelectorAll('.ticket-option');
    ticketOptions.forEach(option => {
        let touchTimeout;
        
        option.addEventListener('touchstart', () => {
            touchTimeout = setTimeout(() => {
                option.classList.add('touch-highlight');
            }, 100);
        }, { passive: true });
        
        option.addEventListener('touchend', () => {
            clearTimeout(touchTimeout);
            setTimeout(() => {
                option.classList.remove('touch-highlight');
            }, 200);
        }, { passive: true });
    });
    
    // Add touch highlight CSS
    const style = document.createElement('style');
    style.textContent = `
        .touch-highlight {
            background: rgba(245, 158, 11, 0.2) !important;
            transform: scale(0.98) !important;
        }
    `;
    document.head.appendChild(style);
}

// ========================================
// CTA Button Interactions
// ========================================
function initializeCTAButtons() {
    const ctaButtons = document.querySelectorAll(`
        .cta-primary,
        .cta-secondary,
        .ticket-cta,
        .final-cta,
        .floating-btn
    `);
    
    ctaButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            handleCTAClick(e, button);
        });
        
        // Add ripple effect
        button.addEventListener('mousedown', (e) => {
            addRippleEffect(e, button);
        });
    });
    
    console.log('🎯 CTA buttons initialized');
}

function handleCTAClick(e, button) {
    e.preventDefault();
    
    const buttonType = button.id || button.className.split(' ')[0];
    
    // Add click animation
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = '';
    }, 150);
    
    // Handle different button types
    switch(true) {
        case buttonType.includes('buy-tickets'):
        case buttonType.includes('live-tickets'):
            handleTicketPurchase('live');
            break;
        case buttonType.includes('buy-ppv'):
        case buttonType.includes('ppv'):
            handleTicketPurchase('ppv');
            break;
        case buttonType.includes('floating'):
            handleFloatingCTA();
            break;
        default:
            showComingSoon(button);
    }
}

function handleTicketPurchase(type) {
    const messages = {
        live: {
            title: '🎫 BILETY NA ŻYWO',
            message: 'Przekierowanie do systemu zakupu biletów...\n\nFAME MMA 27: KINGDOM\n6 września 2025 • PreZero Arena Gliwice',
            action: 'Otwieranie TicketMaster...'
        },
        ppv: {
            title: '📺 PAY-PER-VIEW',
            message: 'Przekierowanie do platformy PPV...\n\nFAME MMA 27: KINGDOM\nOglądaj w najlepszej jakości HD/4K',
            action: 'Otwieranie platformy PPV...'
        }
    };
    
    const config = messages[type];
    
    // Show purchase modal
    showPurchaseModal(config);
    
    // Track conversion (in real app, this would integrate with analytics)
    console.log(`🎯 Conversion Event: ${type.toUpperCase()}_PURCHASE_CLICK`);
}

function showPurchaseModal(config) {
    const modal = document.createElement('div');
    modal.className = 'purchase-modal';
    modal.innerHTML = `
        <div class="purchase-content">
            <div class="purchase-header">
                <h3>${config.title}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="purchase-body">
                <div class="purchase-message">${config.message}</div>
                <div class="purchase-loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">${config.action}</div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 3000;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    const content = modal.querySelector('.purchase-content');
    content.style.cssText = `
        background: var(--deep-black);
        border: 3px solid var(--victory-gold);
        border-radius: var(--card-radius);
        padding: 40px;
        max-width: 500px;
        width: 90%;
        text-align: center;
        transform: scale(0.8);
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(modal);
    
    // Animate in
    setTimeout(() => {
        modal.style.opacity = '1';
        content.style.transform = 'scale(1)';
    }, 10);
    
    // Close modal
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.addEventListener('click', () => {
        modal.style.opacity = '0';
        content.style.transform = 'scale(0.8)';
        setTimeout(() => document.body.removeChild(modal), 300);
    });
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        if (document.body.contains(modal)) {
            closeBtn.click();
        }
    }, 3000);
}

function handleFloatingCTA() {
    const heroCta = document.querySelector('.hero-cta');
    if (heroCta) {
        heroCta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function showComingSoon(button) {
    const feedback = document.createElement('div');
    feedback.textContent = '🚀 Wkrótce dostępne!';
    feedback.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--victory-gradient);
        color: var(--mma-black);
        padding: 12px 20px;
        border-radius: 8px;
        font-family: var(--font-display);
        font-size: 16px;
        font-weight: 600;
        z-index: 2000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.style.transform = 'translateX(0)', 10);
    setTimeout(() => {
        feedback.style.transform = 'translateX(100%)';
        setTimeout(() => document.body.removeChild(feedback), 300);
    }, 2000);
}

function addRippleEffect(e, button) {
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255,255,255,0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
    `;
    
    // Ensure button has relative positioning
    if (getComputedStyle(button).position === 'static') {
        button.style.position = 'relative';
    }
    
    button.style.overflow = 'hidden';
    button.appendChild(ripple);
    
    // Add ripple animation CSS
    if (!document.querySelector('#ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Remove ripple after animation
    setTimeout(() => {
        if (button.contains(ripple)) {
            button.removeChild(ripple);
        }
    }, 600);
}

// ========================================
// Hype Elements & Dynamic Updates
// ========================================
function initializeHypeElements() {
    // Update social stats periodically
    updateSocialStats();
    setInterval(updateSocialStats, 15000); // Update every 15 seconds
    
    // Add trending hashtag interactions
    const hashtags = document.querySelectorAll('.hashtag');
    hashtags.forEach(hashtag => {
        hashtag.addEventListener('click', () => {
            handleHashtagClick(hashtag);
        });
    });
    
    // Initialize buzz text animation
    animateBuzzText();
    
    console.log('🔥 Hype elements initialized');
}

function updateSocialStats() {
    const viewersElement = document.querySelector('.hype-indicators .hype-number');
    if (viewersElement && viewersElement.textContent.includes(',')) {
        const currentViewers = parseInt(viewersElement.textContent.replace(/,/g, ''));
        const variation = Math.floor(Math.random() * 200) - 100; // ±100 viewers
        const newViewers = Math.max(47000, currentViewers + variation);
        
        viewersElement.textContent = newViewers.toLocaleString();
        
        // Add pulse effect
        viewersElement.parentElement.classList.add('animate-gold');
        setTimeout(() => {
            viewersElement.parentElement.classList.remove('animate-gold');
        }, 1000);
    }
}

function handleHashtagClick(hashtag) {
    const hashtag_text = hashtag.textContent;
    
    // Create floating animation
    const float = hashtag.cloneNode(true);
    float.style.cssText = `
        position: fixed;
        top: ${hashtag.getBoundingClientRect().top}px;
        left: ${hashtag.getBoundingClientRect().left}px;
        pointer-events: none;
        z-index: 2000;
        transform: scale(1.2);
        opacity: 0.8;
        transition: all 1s ease-out;
    `;
    
    document.body.appendChild(float);
    
    // Animate float up and fade
    setTimeout(() => {
        float.style.transform = 'scale(1.5) translateY(-50px)';
        float.style.opacity = '0';
    }, 10);
    
    setTimeout(() => document.body.removeChild(float), 1000);
    
    // Show hashtag info
    showHashtagInfo(hashtag_text);
}

function showHashtagInfo(hashtag) {
    const info = {
        '#FAMEMMA27': 'Oficjalny hashtag gali • 892K postów',
        '#KINGDOM': 'Temat przewodni • 234K postów', 
        '#SOLDIĆVSADAMEK': 'Walka wieczoru • 445K postów',
        '#LEXYVSSHEEYA': 'Co-main event • 178K postów'
    };
    
    const message = info[hashtag] || 'Trending hashtag dla FAME MMA 27';
    
    const popup = document.createElement('div');
    popup.textContent = message;
    popup.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--deep-black);
        border: 2px solid var(--victory-gold);
        color: var(--mma-white);
        padding: 12px 20px;
        border-radius: 8px;
        font-family: var(--font-body);
        font-size: 14px;
        z-index: 2000;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => popup.style.opacity = '1', 10);
    setTimeout(() => {
        popup.style.opacity = '0';
        setTimeout(() => document.body.removeChild(popup), 300);
    }, 3000);
}

function animateBuzzText() {
    const buzzText = document.querySelector('.buzz-text');
    if (!buzzText) return;
    
    const originalText = buzzText.textContent;
    let counter = 47892;
    
    const updateText = () => {
        const variation = Math.floor(Math.random() * 20) - 10;
        counter = Math.max(47000, counter + variation);
        buzzText.textContent = `Dołącz do ${counter.toLocaleString()} osób oglądających na żywo!`;
    };
    
    setInterval(updateText, 5000);
}

// ========================================
// Performance Optimization
// ========================================
function optimizePerformance() {
    // Lazy load images when they come into view
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
    
    // Debounce scroll events
    let scrollTimer = null;
    const handleScroll = () => {
        if (scrollTimer !== null) {
            clearTimeout(scrollTimer);
        }
        scrollTimer = setTimeout(() => {
            // Scroll-dependent operations here
        }, 150);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    console.log('⚡ Performance optimizations applied');
}

// ========================================
// Error Handling & Analytics
// ========================================
function initializeErrorHandling() {
    window.addEventListener('error', (e) => {
        console.error('🚨 FAME MMA 27 Error:', e.error);
        // In production, send to analytics
    });
    
    // Track user engagement
    trackEngagement();
}

function trackEngagement() {
    const engagementEvents = {
        pageLoad: Date.now(),
        scrollDepth: 0,
        ctaClicks: 0,
        ticketInteractions: 0
    };
    
    // Track scroll depth
    let maxScroll = 0;
    window.addEventListener('scroll', () => {
        const scrollPercent = Math.round(
            (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
        );
        maxScroll = Math.max(maxScroll, scrollPercent);
        engagementEvents.scrollDepth = maxScroll;
    }, { passive: true });
    
    // Track CTA clicks
    document.addEventListener('click', (e) => {
        if (e.target.closest('.cta-primary, .cta-secondary, .ticket-cta')) {
            engagementEvents.ctaClicks++;
        }
        if (e.target.closest('.ticket-option')) {
            engagementEvents.ticketInteractions++;
        }
    });
    
    // Send analytics on page unload
    window.addEventListener('beforeunload', () => {
        const sessionTime = Date.now() - engagementEvents.pageLoad;
        console.log('📊 Session Analytics:', {
            ...engagementEvents,
            sessionTime: Math.round(sessionTime / 1000) + 's'
        });
        // In production: sendAnalytics(engagementEvents);
    });
}

// ========================================
// Initialize everything
// ========================================
// Performance optimization
setTimeout(optimizePerformance, 1000);

// Error handling
initializeErrorHandling();

// Global event listeners
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Resume animations/updates when page becomes visible
        console.log('🥊 FAME MMA 27 - Page resumed');
    }
});

console.log('🔥 FAME MMA 27: KINGDOM - All systems loaded and ready for battle!');
console.log('🎯 Event Date:', EVENT_CONFIG.eventDate);
console.log('🏟️ Venue:', EVENT_CONFIG.venue);
console.log('💥 Main Event:', EVENT_CONFIG.mainEvent);