// ========================================
// byMN.agency - Breakthrough Interactive Experience
// Netflix-Style AI Transformation Stories
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎬 Initializing breakthrough storytelling experience...');
    
    // Initialize the story experience
    initializeStorySelection();
    initializeStoryExperience();
    initializeNeuralVisualization();
    initializeCodeExecution();
    initializeMetrics();
    initializeTechnicalOverlay();
    
    console.log('✨ Interactive AI transformation stories ready!');
});

// ========================================
// Story Data & Configuration
// ========================================
const STORIES = {
    'email-overwhelm': {
        character: {
            name: 'Sarah Chen',
            role: 'Marketing Director, TechCorp',
            avatar: 'SC',
            color: '#ff6b35'
        },
        timeline: {
            before: {
                time: 'Before AI',
                scene: 'Sarah starts her day drowning in 89 unread emails. She spends the first 3 hours of every day just sorting through messages, often missing critical communications from stakeholders.',
                impact: 'Daily frustration: High | Strategic work time: 2.3 hours | Stress level: Critical',
                metrics: { time: '3.2h', accuracy: '67%', satisfaction: '2/10' }
            },
            week1: {
                time: 'Week 1 - AI Integration',
                scene: 'byMN\'s AI begins learning Sarah\'s email patterns. It identifies 73% of emails as routine, automatically categorizes urgent messages, and suggests optimal response times.',
                impact: 'AI is learning her patterns and priorities. Email processing time reduced by 40%.',
                metrics: { time: '1.9h', accuracy: '84%', satisfaction: '6/10' }
            },
            month1: {
                time: 'Month 1 - Smart Automation',
                scene: 'The AI now handles routine responses automatically, schedules meetings intelligently, and presents Sarah with a daily priority digest of just 12 critical items.',
                impact: 'Sarah reclaims 2.1 hours daily for strategic work. Team communication becomes more focused and effective.',
                metrics: { time: '47min', accuracy: '94%', satisfaction: '8/10' }
            },
            month3: {
                time: 'Month 3 - Strategic Transformation',
                scene: 'Sarah\'s AI predicts stakeholder needs, drafts context-aware responses, and proactively surfaces opportunities. She\'s become the most responsive leader in the company.',
                impact: 'Complete transformation: From email slave to strategic leader. Team productivity up 340%.',
                metrics: { time: '23min', accuracy: '97%', satisfaction: '10/10' }
            },
            after: {
                time: 'After Transformation',
                scene: 'Sarah now spends her mornings on strategic planning instead of email triage. Her AI handles 94% of routine communications, while she focuses on innovation and team leadership.',
                impact: 'Career breakthrough: Promoted to VP Marketing. Team efficiency increased 340%. Personal stress eliminated.',
                metrics: { time: '15min', accuracy: '98%', satisfaction: '10/10' }
            }
        },
        choices: [
            {
                scenario: 'Sarah receives 47 urgent-marked emails this morning. What should the AI prioritize?',
                options: [
                    { text: 'Process by sender importance', impact: 'AI learns stakeholder hierarchy and relationship context' },
                    { text: 'Group by project urgency', impact: 'AI develops project management intelligence and timeline awareness' },
                    { text: 'Auto-respond to routine queries', impact: 'AI builds natural language processing and response generation' },
                    { text: 'Schedule based on optimal response times', impact: 'AI learns communication patterns and behavioral psychology' }
                ]
            }
        ],
        code: {
            file: 'email_intelligence.py',
            content: `
import neural_language_processing as nlp
from priority_engine import StakeholderRanking
from temporal_optimization import ResponseTiming

class EmailIntelligenceSystem:
    def __init__(self):
        self.language_model = nlp.TransformerModel(
            parameters=175e9,
            context_window=32000,
            languages=['en', 'es', 'fr', 'de']
        )
        self.priority_engine = StakeholderRanking()
        self.response_optimizer = ResponseTiming()
    
    def process_email_batch(self, emails):
        # Analyze emotional context and urgency
        for email in emails:
            sentiment = self.language_model.analyze_sentiment(email.content)
            urgency = self.priority_engine.calculate_urgency(
                sender=email.sender,
                content=email.content,
                context=email.thread_history
            )
            
            # Generate intelligent response suggestions
            if urgency > 0.8:
                response = self.language_model.generate_response(
                    context=email.content,
                    tone="professional",
                    length="concise"
                )
                
        return self.priority_engine.rank_by_impact(emails)
        
# Real-time processing
system = EmailIntelligenceSystem()
processed = system.process_email_batch(sarah_emails)
`,
            output: `
Processing 47 emails...
✓ Identified 12 high-priority stakeholder messages
✓ Auto-categorized 31 routine communications  
✓ Generated response suggestions for 8 urgent items
✓ Scheduled optimal response times based on recipient patterns

Processing complete: 2.3 seconds
Priority digest ready for Sarah's review
`
        }
    },
    
    'report-hell': {
        character: {
            name: 'Marcus Rodriguez',
            role: 'Business Analyst, DataCorp',
            avatar: 'MR',
            color: '#00d4ff'
        },
        timeline: {
            before: {
                time: 'Before AI',
                scene: 'Marcus spends 2-3 days each week manually gathering data from 15 different systems, formatting spreadsheets, and creating reports that are often outdated by the time they\'re delivered.',
                impact: 'Report creation time: 18-24 hours | Data accuracy: 73% | Strategic analysis: Minimal',
                metrics: { time: '22h', accuracy: '73%', insights: '2' }
            },
            week1: {
                time: 'Week 1 - Data Integration',
                scene: 'byMN\'s AI connects to all data sources and begins learning Marcus\'s reporting patterns. It identifies data inconsistencies and suggests automated collection processes.',
                impact: 'AI maps data relationships and identifies reporting bottlenecks. Manual work reduced by 35%.',
                metrics: { time: '14h', accuracy: '81%', insights: '5' }
            },
            month1: {
                time: 'Month 1 - Intelligent Automation',
                scene: 'The AI now automatically pulls data from all systems, performs quality checks, and generates preliminary reports. Marcus reviews and adds strategic analysis rather than gathering data.',
                impact: 'Data gathering automated. Marcus focuses on analysis and insights generation.',
                metrics: { time: '4h', accuracy: '94%', insights: '12' }
            },
            month3: {
                time: 'Month 3 - Predictive Intelligence',
                scene: 'The AI not only generates reports but identifies trends, anomalies, and opportunities automatically. Reports include predictive insights and actionable recommendations.',
                impact: 'From data gatherer to strategic advisor. Reports now drive business decisions.',
                metrics: { time: '1.5h', accuracy: '97%', insights: '23' }
            },
            after: {
                time: 'After Transformation',
                scene: 'Marcus now publishes real-time, intelligent dashboards that update automatically. He spends his time on strategic analysis, trend identification, and business optimization.',
                impact: 'Career transformation: Became Head of Business Intelligence. Reports drive 67% more business decisions.',
                metrics: { time: '45min', accuracy: '98%', insights: '31' }
            }
        }
    }
};

let currentStory = null;
let currentTimelinePosition = 'before';
let storyProgress = 0;

// ========================================
// Story Selection Interface
// ========================================
function initializeStorySelection() {
    const storyPaths = document.querySelectorAll('.story-path');
    
    storyPaths.forEach(path => {
        path.addEventListener('click', () => {
            const storyId = path.dataset.story;
            selectStory(storyId);
        });
        
        // Add hover effects
        path.addEventListener('mouseenter', () => {
            path.style.transform = 'translateY(-12px) scale(1.02)';
        });
        
        path.addEventListener('mouseleave', () => {
            path.style.transform = 'translateY(0) scale(1)';
        });
    });
}

function selectStory(storyId) {
    if (!STORIES[storyId]) {
        console.warn(`Story ${storyId} not found`);
        return;
    }
    
    currentStory = STORIES[storyId];
    
    // Animate transition
    const storyIntro = document.getElementById('story-intro');
    const storyExperience = document.getElementById('story-experience');
    
    storyIntro.style.opacity = '0';
    storyIntro.style.transform = 'translateY(-50px)';
    
    setTimeout(() => {
        storyIntro.style.display = 'none';
        storyExperience.style.display = 'flex';
        
        // Initialize the selected story
        loadStoryContent();
        startStoryExperience();
        
        setTimeout(() => {
            storyExperience.style.opacity = '1';
            storyExperience.style.transform = 'translateY(0)';
        }, 100);
    }, 600);
}

// ========================================
// Story Experience
// ========================================
function initializeStoryExperience() {
    // Timeline interaction
    const timelinePoints = document.querySelectorAll('.timeline-point');
    timelinePoints.forEach(point => {
        point.addEventListener('click', () => {
            const timePoint = point.dataset.time;
            navigateToTimepoint(timePoint);
        });
    });
    
    // Navigation buttons
    const switchPerspectiveBtn = document.getElementById('switch-perspective');
    const showTechBtn = document.getElementById('show-tech');
    const startTransformationBtn = document.getElementById('start-transformation');
    
    if (switchPerspectiveBtn) {
        switchPerspectiveBtn.addEventListener('click', switchPerspective);
    }
    
    if (showTechBtn) {
        showTechBtn.addEventListener('click', showTechnicalOverlay);
    }
    
    if (startTransformationBtn) {
        startTransformationBtn.addEventListener('click', startTransformation);
    }
    
    // Tech tabs
    const techTabs = document.querySelectorAll('.tech-tab');
    techTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabType = tab.dataset.tab;
            switchTechTab(tabType);
        });
    });
}

function loadStoryContent() {
    if (!currentStory) return;
    
    // Load character info
    document.getElementById('character-name').textContent = currentStory.character.name;
    document.getElementById('character-role').textContent = currentStory.character.role;
    document.getElementById('character-avatar').textContent = currentStory.character.avatar;
    document.getElementById('character-avatar').style.background = `linear-gradient(135deg, ${currentStory.character.color}, ${adjustColor(currentStory.character.color, -20)})`;
    
    // Update story title
    document.getElementById('current-story-title').textContent = `${currentStory.character.name}'s Transformation`;
    
    // Load timeline content
    navigateToTimepoint('before');
    
    // Load code content if available
    if (currentStory.code) {
        document.getElementById('live-code').innerHTML = syntaxHighlight(currentStory.code.content);
        document.getElementById('code-output').textContent = currentStory.code.output;
    }
}

function navigateToTimepoint(timepoint) {
    currentTimelinePosition = timepoint;
    
    // Update timeline UI
    document.querySelectorAll('.timeline-point').forEach(point => {
        point.classList.remove('active');
    });
    document.querySelector(`[data-time="${timepoint}"]`).classList.add('active');
    
    // Load content for this timepoint
    const timelineData = currentStory.timeline[timepoint];
    if (timelineData) {
        updateStoryContent(timelineData);
    }
    
    // Update progress
    const timepoints = ['before', 'week1', 'month1', 'month3', 'after'];
    const progress = (timepoints.indexOf(timepoint) / (timepoints.length - 1)) * 100;
    document.getElementById('story-progress').style.width = `${progress}%`;
    
    // Update metrics if available
    if (timelineData.metrics) {
        updateMetrics(timelineData.metrics);
    }
}

function updateStoryContent(timelineData) {
    const storyContent = document.getElementById('story-content');
    
    storyContent.innerHTML = `
        <div class="story-scene">
            <div class="scene-time">${timelineData.time}</div>
            <div class="scene-description">${timelineData.scene}</div>
            <div class="scene-impact">
                <strong>Impact:</strong> ${timelineData.impact}
            </div>
        </div>
    `;
    
    // Add choice trigger if this timepoint has choices
    if (currentStory.choices && currentTimelinePosition === 'week1') {
        const choicesContainer = document.getElementById('story-choices');
        choicesContainer.innerHTML = `
            <button class="choice-trigger" onclick="showChoiceModal()">
                What should the AI do next? <strong>You decide →</strong>
            </button>
        `;
    }
    
    // Animate content entrance
    storyContent.style.opacity = '0';
    storyContent.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        storyContent.style.opacity = '1';
        storyContent.style.transform = 'translateY(0)';
    }, 150);
}

// ========================================
// Choice System
// ========================================
function showChoiceModal() {
    const choiceModal = document.getElementById('choice-modal');
    const choice = currentStory.choices[0]; // For demo, using first choice
    
    document.getElementById('choice-scenario').textContent = choice.scenario;
    
    const choiceOptions = document.getElementById('choice-options');
    choiceOptions.innerHTML = '';
    
    choice.options.forEach((option, index) => {
        const optionButton = document.createElement('button');
        optionButton.className = 'choice-option';
        optionButton.textContent = option.text;
        optionButton.addEventListener('click', () => selectChoice(index, option));
        choiceOptions.appendChild(optionButton);
    });
    
    choiceModal.classList.add('active');
}

function selectChoice(index, option) {
    // Update UI to show selection
    document.querySelectorAll('.choice-option').forEach((btn, i) => {
        btn.classList.remove('selected');
        if (i === index) {
            btn.classList.add('selected');
        }
    });
    
    // Show impact preview
    const impactPreview = document.getElementById('impact-preview');
    impactPreview.innerHTML = `
        <div class="impact-content">
            <strong>If you choose this approach:</strong><br>
            ${option.impact}
        </div>
    `;
    
    // Auto-advance after selection
    setTimeout(() => {
        document.getElementById('choice-modal').classList.remove('active');
        navigateToTimepoint('month1');
        
        // Update neural explanation
        updateNeuralExplanation(option.impact);
    }, 2000);
}

// ========================================
// Neural Network Visualization
// ========================================
function initializeNeuralVisualization() {
    const canvas = document.getElementById('neural-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let animationFrame;
    
    // Neural network structure
    const layers = [
        { nodes: 6, x: 50 },
        { nodes: 10, x: 150 },
        { nodes: 8, x: 250 },
        { nodes: 4, x: 350 }
    ];
    
    function drawNeuralNetwork() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw connections
        ctx.lineWidth = 1;
        layers.forEach((layer, layerIndex) => {
            if (layerIndex < layers.length - 1) {
                const nextLayer = layers[layerIndex + 1];
                
                for (let i = 0; i < layer.nodes; i++) {
                    const y1 = 50 + (i * (canvas.height - 100) / (layer.nodes - 1));
                    
                    for (let j = 0; j < nextLayer.nodes; j++) {
                        const y2 = 50 + (j * (canvas.height - 100) / (nextLayer.nodes - 1));
                        const activation = Math.random() * 0.8 + 0.2;
                        
                        ctx.strokeStyle = `rgba(255, 107, 53, ${activation * 0.6})`;
                        ctx.beginPath();
                        ctx.moveTo(layer.x + 8, y1);
                        ctx.lineTo(nextLayer.x - 8, y2);
                        ctx.stroke();
                    }
                }
            }
        });
        
        // Draw nodes
        layers.forEach(layer => {
            for (let i = 0; i < layer.nodes; i++) {
                const y = 50 + (i * (canvas.height - 100) / (layer.nodes - 1));
                const activation = Math.random() * 0.8 + 0.2;
                
                ctx.beginPath();
                ctx.arc(layer.x, y, 6, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 212, 255, ${activation})`;
                ctx.fill();
                
                ctx.strokeStyle = '#00d4ff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });
        
        animationFrame = requestAnimationFrame(drawNeuralNetwork);
    }
    
    drawNeuralNetwork();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
    });
}

function updateNeuralExplanation(impact) {
    const explanation = document.getElementById('neural-explanation');
    explanation.textContent = `Neural network adapting: ${impact}`;
}

// ========================================
// Code Execution Simulation
// ========================================
function initializeCodeExecution() {
    // Simulate typing effect for code
    const codeContent = document.getElementById('live-code');
    if (codeContent && currentStory && currentStory.code) {
        typeCode(currentStory.code.content, codeContent);
    }
}

function typeCode(code, element) {
    element.innerHTML = '';
    let index = 0;
    
    function typeCharacter() {
        if (index < code.length) {
            const char = code.charAt(index);
            element.innerHTML += char;
            
            // Scroll to bottom
            element.scrollTop = element.scrollHeight;
            
            index++;
            setTimeout(typeCharacter, Math.random() * 20 + 5);
        } else {
            // Apply syntax highlighting when done
            element.innerHTML = syntaxHighlight(code);
        }
    }
    
    setTimeout(typeCharacter, 1000);
}

function syntaxHighlight(code) {
    return code
        .replace(/\b(import|from|class|def|if|else|for|while|return|try|except)\b/g, '<span class="keyword">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="number">$1</span>')
        .replace(/'([^']*)'|"([^"]*)"/g, '<span class="string">\'$1$2\'</span>')
        .replace(/#.*/g, '<span class="comment">$&</span>')
        .replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="function">$1</span>');
}

// ========================================
// Metrics Dashboard
// ========================================
function initializeMetrics() {
    // Initialize performance chart
    const canvas = document.getElementById('performance-chart');
    if (canvas) {
        drawPerformanceChart(canvas);
    }
    
    // Start real-time metric updates
    setInterval(updateLiveMetrics, 2000);
}

function updateMetrics(metrics) {
    if (metrics.time) {
        document.getElementById('processing-speed').textContent = '2.3ms';
    }
    if (metrics.accuracy) {
        document.getElementById('accuracy-rate').textContent = metrics.accuracy;
    }
    if (metrics.satisfaction) {
        const timeSaved = calculateTimeSaved(metrics.time);
        document.getElementById('time-saved').textContent = timeSaved;
    }
}

function updateLiveMetrics() {
    // Simulate real-time metric updates
    const processingSpeed = (Math.random() * 2 + 1.5).toFixed(1) + 'ms';
    const accuracy = (Math.random() * 2 + 96.5).toFixed(1) + '%';
    const timeSaved = (Math.random() * 0.5 + 2.5).toFixed(1) + 'h';
    const costReduction = '£' + (Math.random() * 100 + 800).toFixed(0);
    
    document.getElementById('processing-speed').textContent = processingSpeed;
    document.getElementById('accuracy-rate').textContent = accuracy;
    document.getElementById('time-saved').textContent = timeSaved;
    document.getElementById('cost-reduction').textContent = costReduction;
}

function drawPerformanceChart(canvas) {
    const ctx = canvas.getContext('2d');
    const dataPoints = [];
    
    // Generate sample performance data
    for (let i = 0; i < 50; i++) {
        dataPoints.push({
            x: i * (canvas.width / 49),
            y: canvas.height - (Math.random() * 50 + 50)
        });
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = (i + 1) * (canvas.height / 6);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        // Draw performance line
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        dataPoints.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        
        ctx.stroke();
        
        // Update data points
        dataPoints.forEach(point => {
            point.y += (Math.random() - 0.5) * 4;
            point.y = Math.max(50, Math.min(canvas.height - 20, point.y));
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

// ========================================
// Technical Overlay
// ========================================
function initializeTechnicalOverlay() {
    const closeOverlay = document.getElementById('close-overlay');
    if (closeOverlay) {
        closeOverlay.addEventListener('click', hideTechnicalOverlay);
    }
}

function showTechnicalOverlay() {
    const overlay = document.getElementById('tech-overlay');
    overlay.classList.add('active');
}

function hideTechnicalOverlay() {
    const overlay = document.getElementById('tech-overlay');
    overlay.classList.remove('active');
}

function switchTechTab(tabType) {
    // Update tab buttons
    document.querySelectorAll('.tech-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabType}"]`).classList.add('active');
    
    // Update panels
    document.querySelectorAll('.tech-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${tabType}-panel`).classList.add('active');
}

// ========================================
// Utility Functions
// ========================================
function adjustColor(color, percent) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)}`;
}

function calculateTimeSaved(originalTime) {
    // Convert original time to minutes and calculate savings
    const timeValue = parseFloat(originalTime);
    const savedMinutes = Math.max(0, 180 - (timeValue * 60)); // Assuming 3h original
    return (savedMinutes / 60).toFixed(1) + 'h';
}

function switchPerspective() {
    // Toggle between human story and technical view prominence
    const humanStory = document.getElementById('human-story');
    const techStory = document.getElementById('tech-story');
    
    if (humanStory.style.order === '2') {
        humanStory.style.order = '1';
        techStory.style.order = '2';
    } else {
        humanStory.style.order = '2';
        techStory.style.order = '1';
    }
}

function startTransformation() {
    // Show transformation CTA
    const storyExperience = document.getElementById('story-experience');
    const transformationCta = document.getElementById('transformation-cta');
    
    storyExperience.style.display = 'none';
    transformationCta.style.display = 'block';
    
    // Initialize CTA animations
    setTimeout(() => {
        transformationCta.style.opacity = '1';
    }, 100);
}

function startStoryExperience() {
    // Auto-play story progression for demo
    let currentStep = 0;
    const steps = ['before', 'week1', 'month1', 'month3', 'after'];
    
    const autoProgress = setInterval(() => {
        if (currentStep < steps.length - 1) {
            currentStep++;
            navigateToTimepoint(steps[currentStep]);
        } else {
            clearInterval(autoProgress);
            // Show final CTA after story completion
            setTimeout(() => {
                showTransformationCTA();
            }, 3000);
        }
    }, 8000); // 8 seconds per step
}

function showTransformationCTA() {
    const transformationCta = document.getElementById('transformation-cta');
    transformationCta.style.display = 'block';
    transformationCta.scrollIntoView({ behavior: 'smooth' });
}

// Initialize CTA interactions
document.addEventListener('DOMContentLoaded', function() {
    const startJourneyBtn = document.getElementById('start-my-journey');
    const seeAllStoriesBtn = document.getElementById('see-all-stories');
    
    if (startJourneyBtn) {
        startJourneyBtn.addEventListener('click', () => {
            console.log('🚀 Starting user transformation journey...');
            // This would typically open a lead capture form or redirect to onboarding
            alert('Welcome to your AI transformation! A specialist will contact you within 24 hours to begin your personalized journey.');
        });
    }
    
    if (seeAllStoriesBtn) {
        seeAllStoriesBtn.addEventListener('click', () => {
            // Return to story selection
            location.reload();
        });
    }
});

// Analytics tracking
function trackStoryInteraction(action, story, timepoint = null) {
    console.log(`📊 Story Interaction: ${action}`, { 
        story: story?.character?.name || 'unknown',
        timepoint,
        timestamp: new Date().toISOString()
    });
    
    // This would integrate with actual analytics
    // gtag('event', action, { story, timepoint });
}

// Track initial load
trackStoryInteraction('story_system_loaded', null);

console.log('🎭 Breakthrough storytelling system initialized!');
console.log('🎬 Netflix-style AI transformation experience ready!');
console.log('🚀 Interactive choice-driven narratives active!');