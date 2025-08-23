// ========================================
// byMN.agency - Interactive JavaScript
// Conversion-Optimized Functionality
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all features
    initializeLoading();
    initializeCounters();
    initializeROICalculator();
    initializeModals();
    initializeInteractions();
    initializeAnimations();
    
    console.log('🚀 byMN.agency prototype loaded successfully!');
});

// ========================================
// Loading Screen Animation
// ========================================
function initializeLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingLines = document.querySelectorAll('.loading-line');
    
    // Simulate loading sequence
    setTimeout(() => {
        loadingLines.forEach((line, index) => {
            setTimeout(() => {
                line.style.opacity = '1';
            }, index * 500);
        });
    }, 500);
    
    // Hide loading screen after sequence
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            // Start hero animations
            startHeroAnimations();
        }, 500);
    }, 3000);
}

// ========================================
// Animated Counters
// ========================================
function initializeCounters() {
    const counters = document.querySelectorAll('[data-count]');
    
    function animateCounter(element, target, duration = 2000) {
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            
            // Format the number based on size
            let displayValue;
            if (target >= 1000000) {
                displayValue = (current / 1000000).toFixed(1) + 'M';
            } else if (target >= 1000) {
                displayValue = Math.floor(current).toLocaleString();
            } else {
                displayValue = Math.floor(current);
            }
            
            element.textContent = displayValue;
        }, 16);
    }
    
    // Intersection Observer for counter animation
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const element = entry.target;
                const target = parseInt(element.dataset.count);
                animateCounter(element, target);
                counterObserver.unobserve(element);
            }
        });
    }, { threshold: 0.5 });
    
    counters.forEach(counter => {
        counterObserver.observe(counter);
    });
}

// ========================================
// ROI Calculator
// ========================================
function initializeROICalculator() {
    const inputs = {
        monthlyLeads: document.getElementById('monthly-leads'),
        conversionRate: document.getElementById('conversion-rate'),
        avgDeal: document.getElementById('avg-deal'),
        teamHours: document.getElementById('team-hours')
    };
    
    const results = {
        currentRevenue: document.getElementById('current-revenue'),
        optimizedRevenue: document.getElementById('optimized-revenue'),
        revenueIncrease: document.getElementById('revenue-increase'),
        timeSavings: document.getElementById('time-savings')
    };
    
    function calculateROI() {
        const leads = parseFloat(inputs.monthlyLeads.value) || 0;
        const conversion = parseFloat(inputs.conversionRate.value) || 0;
        const dealSize = parseFloat(inputs.avgDeal.value) || 0;
        const hours = parseFloat(inputs.teamHours.value) || 0;
        
        // Current metrics
        const currentMonthlyDeals = leads * (conversion / 100);
        const currentMonthlyRevenue = currentMonthlyDeals * dealSize;
        const currentAnnualRevenue = currentMonthlyRevenue * 12;
        
        // Optimized metrics (3x conversion improvement)
        const optimizedConversion = Math.min(conversion * 3, 50); // Cap at 50%
        const optimizedMonthlyDeals = leads * (optimizedConversion / 100);
        const optimizedMonthlyRevenue = optimizedMonthlyDeals * dealSize;
        const optimizedAnnualRevenue = optimizedMonthlyRevenue * 12;
        
        // Calculations
        const revenueIncrease = optimizedAnnualRevenue - currentAnnualRevenue;
        const timeSavingsAnnual = hours * 52; // hours per week * 52 weeks
        
        // Update display
        results.currentRevenue.textContent = formatCurrency(currentAnnualRevenue);
        results.optimizedRevenue.textContent = formatCurrency(optimizedAnnualRevenue);
        results.revenueIncrease.textContent = formatCurrency(revenueIncrease);
        results.timeSavings.textContent = `${timeSavingsAnnual.toLocaleString()} hours`;
        
        // Add visual feedback
        updateCalculatorVisuals(revenueIncrease);
    }
    
    function formatCurrency(amount) {
        if (amount >= 1000000) {
            return `€${(amount / 1000000).toFixed(1)}M`;
        } else if (amount >= 1000) {
            return `€${(amount / 1000).toFixed(0)}K`;
        } else {
            return `€${amount.toFixed(0)}`;
        }
    }
    
    function updateCalculatorVisuals(increase) {
        const calculatorResults = document.querySelector('.calculator-results');
        
        if (increase > 500000) {
            calculatorResults.style.borderColor = 'var(--accent-green)';
        } else if (increase > 100000) {
            calculatorResults.style.borderColor = 'var(--accent-cyan)';
        } else {
            calculatorResults.style.borderColor = 'var(--accent-purple)';
        }
    }
    
    // Add event listeners
    Object.values(inputs).forEach(input => {
        input.addEventListener('input', calculateROI);
        input.addEventListener('change', calculateROI);
    });
    
    // Initial calculation
    calculateROI();
}

// ========================================
// Modal System
// ========================================
function initializeModals() {
    const modal = document.getElementById('lead-modal');
    const closeBtn = modal.querySelector('.modal-close');
    const form = document.getElementById('lead-form');
    const nextBtn = form.querySelector('.btn-next');
    const prevBtn = form.querySelector('.btn-prev');
    
    // CTA buttons that open modal
    const ctaButtons = [
        document.getElementById('primary-cta'),
        document.getElementById('final-cta-primary'),
        ...document.querySelectorAll('.cta-calculator')
    ];
    
    // Form steps
    const steps = form.querySelectorAll('.form-step');
    let currentStep = 1;
    
    // Open modal
    function openModal() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        trackEvent('Modal Opened', { source: 'CTA Click' });
    }
    
    // Close modal
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        resetForm();
    }
    
    // Navigate form steps
    function showStep(step) {
        steps.forEach(s => s.classList.remove('active'));
        steps[step - 1].classList.add('active');
        currentStep = step;
        
        // Update progress (could add progress bar here)
        trackEvent('Form Step', { step: step });
    }
    
    function resetForm() {
        currentStep = 1;
        showStep(1);
        form.reset();
    }
    
    // Event listeners
    ctaButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', openModal);
        }
    });
    
    closeBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (validateStep(currentStep)) {
            showStep(2);
        }
    });
    
    prevBtn.addEventListener('click', () => {
        showStep(1);
    });
    
    // Form submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (validateStep(2)) {
            submitForm();
        }
    });
    
    // Form validation
    function validateStep(step) {
        const currentStepEl = steps[step - 1];
        const inputs = currentStepEl.querySelectorAll('input[required], select[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.style.borderColor = '#ef4444';
                isValid = false;
            } else {
                input.style.borderColor = '';
            }
        });
        
        if (!isValid) {
            showNotification('Please fill in all required fields', 'error');
        }
        
        return isValid;
    }
    
    // Form submission
    function submitForm() {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        
        // Show loading state
        const submitBtn = form.querySelector('.btn-submit');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'PROCESSING...';
        submitBtn.disabled = true;
        
        // Simulate API call
        setTimeout(() => {
            console.log('Form submitted:', data);
            trackEvent('Form Submitted', data);
            
            // Show success message
            showSuccessMessage();
            
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            
            // Close modal after delay
            setTimeout(() => {
                closeModal();
            }, 2000);
        }, 1500);
    }
    
    function showSuccessMessage() {
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 48px; margin-bottom: 24px;">✅</div>
                <h3 style="color: var(--accent-green); margin-bottom: 16px; font-family: var(--font-heading);">Request Submitted Successfully!</h3>
                <p style="color: var(--neutral-gray); margin-bottom: 24px;">Our team will contact you within 24 hours with your personalized AI audit.</p>
                <div style="font-size: 12px; color: var(--neutral-gray);">
                    You'll receive an email confirmation shortly.
                </div>
            </div>
        `;
    }
}

// ========================================
// Interactive Elements
// ========================================
function initializeInteractions() {
    // Service card interactions
    const serviceCards = document.querySelectorAll('.service-card');
    
    serviceCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            // Add hover effects
            card.style.transform = 'translateY(-8px)';
            
            // Animate service icon
            const icon = card.querySelector('.service-icon');
            if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
            }
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            
            const icon = card.querySelector('.service-icon');
            if (icon) {
                icon.style.transform = '';
            }
        });
        
        // Service CTA clicks
        const cta = card.querySelector('.service-cta');
        if (cta) {
            cta.addEventListener('click', () => {
                const service = card.dataset.service;
                trackEvent('Service Interest', { service: service });
                
                // Could open specific calculator or modal here
                showNotification(`${service} analysis requested!`, 'success');
            });
        }
    });
    
    // Testimonial card interactions
    const testimonialCards = document.querySelectorAll('.testimonial-card');
    
    testimonialCards.forEach((card, index) => {
        card.addEventListener('click', () => {
            // Expand testimonial or show full case study
            trackEvent('Testimonial Clicked', { index: index });
        });
    });
    
    // Secondary CTA interactions
    const secondaryButtons = document.querySelectorAll('.cta-secondary, .cta-secondary-large');
    
    secondaryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.querySelector('.cta-text').textContent;
            trackEvent('Secondary CTA', { action: action });
            
            if (action.includes('CALCULATE')) {
                // Smooth scroll to calculator
                document.getElementById('roi-calculator').scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            } else if (action.includes('WAITLIST')) {
                showWaitlistModal();
            }
        });
    });
}

// ========================================
// Animations & Visual Effects
// ========================================
function initializeAnimations() {
    // Intersection Observer for scroll animations
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    // Observe elements for animation
    const animatedElements = document.querySelectorAll(
        '.service-card, .testimonial-card, .trust-badge, .section-title'
    );
    
    animatedElements.forEach(el => {
        animationObserver.observe(el);
    });
    
    // Parallax effect for hero background
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.hero-background');
        
        parallaxElements.forEach(el => {
            const speed = 0.5;
            el.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ========================================
// Hero Animations (after loading)
// ========================================
function startHeroAnimations() {
    const heroElements = [
        '.hero-badge',
        '.hero-title',
        '.hero-subtitle',
        '.hero-metrics',
        '.hero-ctas',
        '.hero-trust'
    ];
    
    heroElements.forEach((selector, index) => {
        const element = document.querySelector(selector);
        if (element) {
            setTimeout(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, index * 200);
        }
    });
}

// ========================================
// Utility Functions
// ========================================
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 24px;
        background: var(--secondary-dark);
        border: 1px solid ${type === 'success' ? 'var(--accent-green)' : type === 'error' ? '#ef4444' : 'var(--accent-cyan)'};
        color: var(--neutral-white);
        padding: 16px 24px;
        border-radius: 8px;
        font-family: var(--font-body);
        font-size: 14px;
        max-width: 300px;
        z-index: 10001;
        transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after delay
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function showWaitlistModal() {
    const modal = document.getElementById('lead-modal');
    const modalBody = modal.querySelector('.modal-body');
    
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <h3 style="color: var(--accent-purple); margin-bottom: 24px; font-family: var(--font-heading);">Join the Waitlist</h3>
            <p style="color: var(--neutral-gray); margin-bottom: 32px; line-height: 1.6;">
                Be the first to know when Q1 2026 slots become available. 
                Priority access for qualified enterprises.
            </p>
            <form id="waitlist-form" style="max-width: 300px; margin: 0 auto;">
                <input type="email" placeholder="Business Email" required 
                       style="width: 100%; padding: 12px; margin-bottom: 16px; background: var(--primary-dark); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: var(--neutral-white);">
                <button type="submit" style="width: 100%; padding: 12px; background: var(--gradient-secondary); border: none; border-radius: 6px; color: var(--neutral-white); font-weight: 600; cursor: pointer;">
                    JOIN WAITLIST
                </button>
            </form>
        </div>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Handle waitlist form
    const waitlistForm = document.getElementById('waitlist-form');
    waitlistForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = waitlistForm.querySelector('input').value;
        
        trackEvent('Waitlist Joined', { email: email });
        showNotification('Added to priority waitlist!', 'success');
        
        setTimeout(() => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }, 1500);
    });
}

function trackEvent(eventName, data = {}) {
    // Analytics tracking (would integrate with GA4, etc.)
    console.log(`📊 Event: ${eventName}`, data);
    
    // Could send to analytics service:
    // gtag('event', eventName, data);
    // analytics.track(eventName, data);
}

// ========================================
// Performance Optimizations
// ========================================

// Lazy load images when they come into view
function initializeLazyLoading() {
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
}

// Throttle scroll events for better performance
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Debounce resize events
function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Initialize performance optimizations
document.addEventListener('DOMContentLoaded', () => {
    initializeLazyLoading();
    
    // Throttled scroll handler
    window.addEventListener('scroll', throttle(() => {
        // Handle scroll-dependent animations
    }, 16));
    
    // Debounced resize handler
    window.addEventListener('resize', debounce(() => {
        // Handle responsive adjustments
    }, 250));
});

// ========================================
// Error Handling
// ========================================
window.addEventListener('error', (e) => {
    console.error('JavaScript Error:', e.error);
    trackEvent('JavaScript Error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno
    });
});

// Service Worker registration (for offline capability)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

console.log('🎯 byMN.agency - Conversion optimization active!');
console.log('📊 All tracking and interactions initialized');
console.log('🚀 Ready for top 10% performance!');