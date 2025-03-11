// Helper: Create BufferGeometry from an array of THREE.Vector3 vertices and an array of face index arrays.
function createBufferGeometry(vertices, faces) {
    const geometry = new THREE.BufferGeometry();
    const positionArray = [];
    vertices.forEach(v => {
        positionArray.push(v.x, v.y, v.z);
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3));
    const indices = [];
    faces.forEach(face => {
        indices.push(face[0], face[1], face[2]);
    });
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
// Game constants and variables
const CHUNK_SIZE = 200;
const RENDER_DISTANCE = 3;
const ROAD_WIDTH = 80;

let scene, camera, renderer;
let controls; // For orbit controls
let useOrbitControls = false; // Flag to toggle between orbit and car-follow camera
let car, wheels = [];
let clock = new THREE.Clock();
let carSpeed = 0;
let carRotation = 0;
let infoElement, controlsElement, healthFill;
let chunks = {};
let currentChunkCoords = { x: 0, z: 0 };
let carVelocity = new THREE.Vector3();
let terrain = new THREE.Group();
let keyStates = {};
let gameStarted = false;
let carHealth = 100;
let coinsCollected = 0; // Track coins collected
let currentChainCoins = 0; // Track coins in current chain
let chainCollectTimeout = null; // Timeout for showing chain total
let collidableObjects = [];
let damagedTrees = [];
let carCollisionBox = new THREE.Box3();
let objectCollisionBox = new THREE.Box3();
let lastCollisionTime = 0;
let damageCooldown = 500; // ms between collision damage
// Rocks variables
let rollingRocks = [];
let lastRockSpawnTime = 0;
let rockSpawnInterval = 500; // Increased to 3 seconds between rock spawns
let isGameOver = false; // Track game over state

// Reward items
let rewardItems = [];
let collectSound;

// Sound variables
let audioContext;
let engineSound;
let collisionSound;
let tireScreechSound;
let isMuted = false;
let lastTurnTime = 0;
let turnCooldown = 500; // ms between tire screech sounds
let previousSpeed = 0;
let engineGainNode;
let masterGainNode;

// Sky and environment variables
let clouds = [];
// skyTime and skySpeed no longer needed for the Sky object
// let skyTime = 0;
// let skySpeed = 0.3;
let environmentalElements = {
    trees: [
        { type: 'pine', freq: 0.4 },
        { type: 'oak', freq: 0.1 },
        { type: 'palm', freq: 0.1 },
        { type: 'maple', freq: 0.1 },
        { type: 'birch', freq: 0.1 },
        { type: 'willow', freq: 0.1 },
        { type: 'birch', freq: 0.1 },
    ],
    vegetation: [
        { type: 'grass', freq: 0.5 },
        { type: 'cactus', freq: 0.2 },
        { type: 'bush', freq: 0.2 },
        { type: 'flower', freq: 0.1 },
    ]
};

// FPS calculation variables
const fpsBufferSize = 20; // Average over the last 60 frames
let fpsBuffer = [];
let lastFrameTime = performance.now();

// Cached reward item resources
const rewardAssets = {
    // Base meshes that will be cloned
    baseMeshes: {
        health: null,
        points: null,
        time: null,
        coin: null
    },
    // Materials
    materials: {
        health: null,
        points: null,
        time: null,
        coin: null
    },
    // Initialize flag
    initialized: false
};

// Initialize reward assets
function initRewardAssets() {
    if (rewardAssets.initialized) return;

    // Health reward (heart)
    const healthMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        emissive: 0xff6666,
        emissiveIntensity: 0.5,
        shininess: 100
    });
    rewardAssets.materials.health = healthMaterial;

    // Create base health reward
    const healthGroup = new THREE.Group();
    const mainSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), healthMaterial);
    const leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), healthMaterial);
    leftLobe.position.set(-0.5, 0.7, 0);
    const rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), healthMaterial);
    rightLobe.position.set(0.5, 0.7, 0);
    healthGroup.add(mainSphere);
    healthGroup.add(leftLobe);
    healthGroup.add(rightLobe);
    rewardAssets.baseMeshes.health = healthGroup;

    // Points reward (star)
    const pointsMaterial = new THREE.MeshPhongMaterial({
        color: 0xffcc00,
        emissive: 0xffaa00,
        emissiveIntensity: 0.5,
        shininess: 100
    });
    rewardAssets.materials.points = pointsMaterial;

    // Create base points reward (using box geometry for simplicity, to be replaced with star)
    const pointsStar = new THREE.Group();
    const star = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.2), pointsMaterial);
    pointsStar.add(star);
    rewardAssets.baseMeshes.points = pointsStar;

    // Time reward (clock)
    const timeMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ccff,
        emissive: 0x0099cc,
        emissiveIntensity: 0.5,
        shininess: 100
    });
    rewardAssets.materials.time = timeMaterial;

    // Create base time reward
    const timeGroup = new THREE.Group();
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1, 32), timeMaterial);
    timeGroup.add(clockFace);
    rewardAssets.baseMeshes.time = timeGroup;

    // Coin reward
    const coinMaterial = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0xbb9900,
        emissiveIntensity: 0.2
    });
    rewardAssets.materials.coin = coinMaterial;

    // Create base coin reward
    const coinGroup = new THREE.Group();
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 32), coinMaterial);
    coin.rotation.x = Math.PI * 0.5;
    coinGroup.add(coin);
    rewardAssets.baseMeshes.coin = coinGroup;

    rewardAssets.initialized = true;
}

// Wait for page load to initialize the 3D world
document.addEventListener('DOMContentLoaded', function () {
    // Initialize the 3D scene first so it's visible behind the loading screen
    init();

    // Force an initial render to show the world immediately
    updateChunks();
    renderer.render(scene, camera);

    // Start animation loop
    animate();
});

// Wait for start button click to initialize game
document.getElementById('start-button').addEventListener('click', function () {
    // User has interacted with the page, now we can create and start audio
    if (typeof Tone !== 'undefined') {
        try {
            // IMPORTANT: Create a new AudioContext as a direct result of user gesture
            // This is the key to fixing "AudioContext was not allowed to start" errors
            console.log("Creating fresh Tone.js audio context from user gesture");

            // Create and start Tone.js context as a direct result of user gesture
            Tone.start().then(() => {
                console.log("Tone.js audio context started successfully");

                // Now it's safe to create our audio manager
                window.tuneJS = new TuneJS();

                // Properly initialize all audio components
                window.tuneJS.initializeAudio();

                console.log("Audio system initialized successfully");
            }).catch(e => {
                console.error("Failed to start Tone.js audio context:", e);
            });
        } catch (e) {
            console.error("Error initializing audio:", e);
        }
    }

    // Animate the glass door effect
    const leftDoor = document.getElementById('loading-left-door');
    const rightDoor = document.getElementById('loading-right-door');
    const loadingScreen = document.getElementById('loading-screen');

    // Step 1: Fade out the content of the loading screen
    loadingScreen.style.opacity = '0';

    // Step 2: After content fades, open the doors
    setTimeout(() => {
        leftDoor.style.transform = 'translateX(-100%)';
        rightDoor.style.transform = 'translateX(100%)';

        // Step 3: After doors open, start the game
        setTimeout(() => {
            // Hide loading screen and doors completely
            document.getElementById('loading-screen').style.display = 'none';
            leftDoor.style.display = 'none';
            rightDoor.style.display = 'none';

            // Show game UI with a glass-like appearance
            document.getElementById('info').style.display = 'block';
            document.getElementById('controls').style.display = 'block';
            document.getElementById('fps').style.display = 'block';
            document.getElementById('health-container').style.display = 'block';
            document.getElementById('coins-container').style.display = 'block';
            document.getElementById('speedometer').style.display = 'block';

            // Finish game initialization (without re-initializing 3D scene)
            completeGameStart();
        }, 800); // Reduced from 1000ms for a quicker transition
    }, 250); // Reduced from 300ms for a quicker fade
});

// Complete game initialization after user interaction
function completeGameStart() {
    infoElement = document.getElementById('info');
    controlsElement = document.getElementById('controls');
    healthFill = document.getElementById('health-fill');
    gameStarted = true;
    carHealth = 100;
    updateHealthBar();
    initAudio();  // Initialize audio

    // Initialize rocks system
    rollingRocks = [];
    lastRockSpawnTime = performance.now() - rockSpawnInterval - 100; // Ensure a rock spawns right away
    console.log("Game started - rocks system initialized");
}

// Initialize the game
function startGame() {
    // This function is no longer needed - logic has been moved to completeGameStart()
    // Keeping it for compatibility but it should no longer be called
    console.warn("startGame() is deprecated - use completeGameStart() instead");
    completeGameStart();
}

// Initialize audio context and load sounds
function initAudio() {
    // Don't do anything here - we'll initialize audio on user interaction
    console.log("Audio initialization deferred until user interaction");

    // Set window.tuneJS to null so we know it hasn't been created yet
    window.tuneJS = null;
}

// TuneJS audio manager class
class TuneJS {
    constructor() {
        console.log("Creating TuneJS instance");

        // Setup basic properties
        this.muted = false;
        this.audioInitialized = false;

        // Check if Tone context is running - it should be at this point
        // since we're creating TuneJS after Tone.start() resolves
        if (Tone.context && Tone.context.state === 'running') {
            console.log("Tone context is already running - good!");

            // Create volume control
            this.masterVolume = new Tone.Volume(-10).toDestination();

            // Set up components (without starting them)
            this.createAudioComponents();
        } else {
            console.warn("Tone context not running - audio may not work correctly");
        }
    }

    // Separate method to create components without connecting/starting
    createAudioComponents() {
        // Create master volume control first
        this.masterVolume = new Tone.Volume(0).toDestination();

        // Define component properties without starting them
        // this.setupEngineSound();
        this.setupCollisionSound();
        this.setupTireScreechSound();
        this.setupCollectSound();
        // this.setupLofiBackground()
    }

    // Method to initialize audio after user interaction
    initializeAudio() {
        if (this.audioInitialized) {
            console.log("Audio already initialized");
            return;
        }

        // Double-check that Tone context is running
        if (!Tone.context || Tone.context.state !== 'running') {
            console.warn("Tone context is not running - attempting to start it");

            // Try to start it again - this must be in response to a user gesture
            Tone.start().then(() => {
                console.log("Tone context started successfully on second attempt");
                this._completeAudioInitialization();
            }).catch(e => {
                console.error("Failed to start Tone context on second attempt:", e);
            });
        } else {
            // Tone context is running, proceed with initialization
            this._completeAudioInitialization();
        }
    }

    // Private method to complete audio initialization
    _completeAudioInitialization() {
        try {
            // Connect all components
            // this.connectEngineSound();
            this.connectCollisionSound();
            this.connectTireScreechSound();
            this.connectCollectSound();

            // Start the lofi background if not muted
            if (!this.muted) {
                this.startLofiBackground();
                console.log("Lo-fi background music started");
            }

            this.audioInitialized = true;
            console.log("Audio initialization completed successfully");
        } catch (e) {
            console.error("Error during audio initialization:", e);
        }
    }

    // Engine sound setup (just creating components without connecting)
    setupEngineSound() {
        // Create filter first (but don't connect yet)
        this.engineFilter = new Tone.Filter({
            type: "lowpass",
            frequency: 800,
            Q: 1
        });

        // Create oscillators (but don't connect or start yet)
        this.engineOsc1 = new Tone.Oscillator({
            type: "sawtooth",
            frequency: 50,
            volume: -30
        });

        this.engineOsc2 = new Tone.Oscillator({
            type: "square",
            frequency: 55,
            volume: -35
        });
    }

    // Connect and start engine sound components
    connectEngineSound() {
        // Now it's safe to connect components
        this.engineFilter.connect(this.masterVolume);
        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);

        // Start oscillators
        this.engineOsc1.start();
        this.engineOsc2.start();
    }

    setupCollisionSound() {
        // Create a more complex collision sound using Tone.js
        this.collisionSynth = new Tone.NoiseSynth({
            noise: {
                type: "white",
                playbackRate: 5
            },
            envelope: {
                attack: 0.001,
                decay: 0.2,
                sustain: 0,
                release: 0.3
            }
        });

        // Add a filter and distortion for impact sound
        this.collisionFilter = new Tone.Filter({
            type: "lowpass",
            frequency: 700
        });

        this.collisionDistortion = new Tone.Distortion({
            distortion: 0.8,
            wet: 0.5
        });
    }

    // Connect collision sound components
    connectCollisionSound() {
        // Now it's safe to connect through effects chain
        this.collisionSynth.connect(this.collisionFilter);
        this.collisionFilter.connect(this.collisionDistortion);
        this.collisionDistortion.connect(this.masterVolume);
    }

    setupTireScreechSound() {
        // Create tire screech using noise synthesis
        this.tireScreechSynth = new Tone.NoiseSynth({
            noise: {
                type: "pink",
                playbackRate: 0.5
            },
            envelope: {
                attack: 0.01,
                decay: 0.2,
                sustain: 0.3,
                release: 0.2
            }
        });

        // Add a bandpass filter for tire screech characteristics
        this.tireScreechFilter = new Tone.Filter({
            type: "bandpass",
            frequency: 2000,
            Q: 1.5
        });
    }

    // Connect tire screech sound components
    connectTireScreechSound() {
        // Connect through effects chain
        this.tireScreechSynth.connect(this.tireScreechFilter);
        this.tireScreechFilter.connect(this.masterVolume);
    }

    setupCollectSound() {
        // Create coin collection sound
        this.collectSynth = new Tone.Synth({
            oscillator: {
                type: "sine"
            },
            envelope: {
                attack: 0.001,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            }
        });
    }

    // Connect collect sound components
    connectCollectSound() {
        this.collectSynth.connect(this.masterVolume);
    }

    setupLofiBackground() {
        // Create a pad synth for ambient background
        this.lofiSynth = new Tone.PolySynth(Tone.Synth).set({
            volume: -20,
            detune: -12,
            portamento: 0.1
        });

        // Add effects chain for lo-fi aesthetic
        this.lofiFilter = new Tone.Filter({
            frequency: 1000,
            type: "lowpass",
            rolloff: -24,
            Q: 1
        });

        // Subtle chorus for width
        this.lofiChorus = new Tone.Chorus({
            frequency: 0.5,
            delayTime: 3.5,
            depth: 0.5,
            spread: 180
        }).start();

        // Vinyl crackle effect using noise
        this.vinylNoise = new Tone.Noise({
            type: "pink",
            volume: -35
        });

        // Reverb for ambience
        this.lofiReverb = new Tone.Reverb({
            decay: 2,
            wet: 0.2
        });

        // Connect effects chain
        this.lofiSynth.chain(this.lofiFilter, this.lofiChorus, this.lofiReverb, this.masterVolume);
        this.vinylNoise.chain(this.lofiFilter, this.masterVolume);

        // Create a looping pattern for the lo-fi beat
        this.lofiLoop = new Tone.Loop((time) => {
            // Simple chord progression
            const chords = [
                ["E3", "G3", "B3", "D4"],
                ["A3", "C4", "E4"],
                ["D3", "F3", "A3", "C4"],
                ["G3", "B3", "D4"]
            ];

            // Play one chord per loop iteration
            const currentChord = chords[Math.floor(time * 0.25) % chords.length];
            this.lofiSynth.triggerAttackRelease(currentChord, "2n", time);
        }, "2n");
    }

    updateEngineSound(speed, acceleration) {
        if (!this.engineOsc1 || this.muted || !this.audioInitialized) return;

        // Ensure speed and acceleration are valid numbers
        speed = Number.isNaN(speed) ? 0 : speed || 0;
        acceleration = Number.isNaN(acceleration) ? 0 : acceleration || 0;

        // Base engine sound on speed and acceleration
        const maxSpeed = 100;
        const normalizedSpeed = Math.min(speed / maxSpeed, 1);

        // Calculate frequency based on speed and acceleration
        const minFreq = 50;
        const maxFreq = 400;
        const baseFreq = minFreq + normalizedSpeed * (maxFreq - minFreq);

        // Add slight variation based on acceleration
        const accelEffect = Math.abs(acceleration) * 30;

        // Update oscillator frequencies
        this.engineOsc1.frequency.rampTo(baseFreq, 0.1);
        this.engineOsc2.frequency.rampTo(baseFreq * 1.005 + accelEffect, 0.1);

        // Adjust volume based on speed
        const volume = -30 + normalizedSpeed * 10;
        this.engineOsc1.volume.rampTo(volume, 0.1);
        this.engineOsc2.volume.rampTo(volume - 5, 0.1);
    }

    playCollisionSound(impactForce) {
        if (this.muted) return;

        // Scale the collision sound based on impact force
        const normalizedForce = Math.min(impactForce / 20, 1);
        const volume = -30 + normalizedForce * 25;

        // Adjust parameters based on impact force
        this.collisionSynth.volume.value = volume;
        this.collisionFilter.frequency.value = 400 + normalizedForce * 1000;

        // Add a small time offset to avoid timing conflicts
        // Using "+" notation to add a small delay from the current time
        this.collisionSynth.triggerAttackRelease("8n", "+0.01");
    }

    playTireScreechSound(intensity = 1) {
        if (this.muted) return;

        // Scale screech intensity
        const volume = -25 + intensity * 10;
        this.tireScreechSynth.volume.value = volume;

        // Adjust filter frequency based on intensity
        this.tireScreechFilter.frequency.value = 1500 + intensity * 1000;

        // Trigger the sound
        this.tireScreechSynth.triggerAttackRelease("16n");
    }

    playCollectSound(pitch = "C5") {
        if (this.muted) return;

        // Play coin collect sound
        this.collectSynth.triggerAttackRelease(pitch, "16n");
    }

    playChainCompleteSound(count) {
        // This method is kept for backward compatibility but is now unused
        // Could be repurposed for a special balloon collection sound in the future
    }

    // Toggle mute state for audio
    toggleMute() {
        this.muted = !this.muted;

        if (this.muted) {
            // Mute by setting volume very low
            if (this.masterVolume) {
                this.masterVolume.volume.value = -100;
            }
            // Stop lo-fi background
            this.stopLofiBackground();
        } else {
            // Restore volume
            if (this.masterVolume) {
                this.masterVolume.volume.value = -10;
            }
            // Restart lo-fi background
            this.startLofiBackground();
        }

        return this.muted;
    }

    // Resume audio context if it was suspended (useful for mobile)
    resumeAudioContext() {
        if (Tone.context.state !== 'running') {
            Tone.context.resume().then(() => {
                console.log("AudioContext resumed successfully");

                // Make sure all audio is properly initialized
                if (!this.audioInitialized) {
                    this.initializeAudio();
                }
                // Otherwise just restart lofi if not muted
                else if (!this.muted) {
                    this.startLofiBackground();
                }
            }).catch(e => {
                console.error("Error resuming audio context:", e);
            });
        }
    }

    startLofiBackground() {
        if (this.muted || !this.audioInitialized) return;

        try {
            // Start the noise for vinyl effect if it exists
            if (this.vinylNoise) {
                this.vinylNoise.start();
            }

            // Start the loop if it exists
            if (this.lofiLoop) {
                this.lofiLoop.start(0);
            }
        } catch (e) {
            console.error("Error starting lo-fi background:", e);
        }
    }

    stopLofiBackground() {
        try {
            if (this.lofiLoop) {
                this.lofiLoop.stop();
            }

            if (this.vinylNoise) {
                this.vinylNoise.stop();
            }
        } catch (e) {
            console.error("Error stopping lo-fi background:", e);
        }
    }
}

// Replace existing audio functions
function loadEngineSound() {
    // Handled by TuneJS
}

function loadCollisionSound() {
    // Handled by TuneJS  
}

function loadTireScreechSound() {
    // Handled by TuneJS
}

function updateEngineSound() {
    if (!window.tuneJS) return;

    // Get car speed and acceleration with safety checks
    const speed = car && typeof car.speed === 'number' ? car.speed : 0;
    const acceleration = car && typeof car.acceleration === 'number' ? car.acceleration : 0;

    window.tuneJS.updateEngineSound(speed, acceleration);
}

function playCollisionSound(impactForce) {
    if (!window.tuneJS) return;
    window.tuneJS.playCollisionSound(impactForce);
}

function playTireScreechSound() {
    if (!window.tuneJS) return;
    window.tuneJS.playTireScreechSound();
}

function toggleMute() {
    if (!window.tuneJS) return;

    // Try to resume the audio context as this function is triggered by user interaction
    try {
        // Resume Tone.js audio context if suspended
        if (Tone.context.state !== 'running') {
            Tone.context.resume();
            console.log("AudioContext resumed by user interaction");

            // Since this is user interaction, it's a good time to fully initialize audio
            if (!window.tuneJS.audioInitialized) {
                window.tuneJS.initializeAudio();
            }
        } else {
            // Just use our helper method to ensure everything is working
            window.tuneJS.resumeAudioContext();
        }
    } catch (e) {
        console.error("Error resuming audio context:", e);
    }

    const isMuted = window.tuneJS.toggleMute();
    console.log("Audio " + (isMuted ? "muted" : "unmuted"));
}

function playCollectSound() {
    if (!window.tuneJS) return;
    window.tuneJS.playCollectSound("G4");
}

// Initialize the 3D scene, camera, and renderer
function init() {
    // Set up scene
    scene = new THREE.Scene();
    // Use a color that matches with the Sky
    scene.background = new THREE.Color(0x8FBCD4); // Sky blue that matches the Sky object
    scene.fog = new THREE.FogExp2(0x8FBCD4, 0.001);

    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 1000);
    camera.position.set(0, 50, 20); // Lower height and same distance
    camera.lookAt(0, 20, -10); // Look more at the car's center

    // Add orbit controls to allow camera manipulation with mouse
    controls = new THREE.OrbitControls(camera, document.body);
    controls.enableDamping = true; // Add smooth damping effect
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 5; // Prevent zooming too close
    controls.maxDistance = 100; // Prevent zooming too far
    controls.maxPolarAngle = Math.PI / 2; // Prevent going below ground
    controls.target.set(0, 20, -10); // Set the target to match lookAt
    controls.enabled = false; // Disabled by default, enable with 'C' key

    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.logarithmicDepthBuffer = true;
    document.body.appendChild(renderer.domElement);

    // Initialize all reusable assets for better performance
    initTreeAssets();
    initRewardAssets();
    initRockAssets();

    // Create animated sky - moved after renderer initialization
    createSky();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);

    // Add scene elements
    scene.add(terrain);
    createCar();

    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => {
        keyStates[e.key.toLowerCase()] = true;

        // Toggle camera mode when 'c' key is pressed
        if (e.key.toLowerCase() === 'c') {
            toggleCameraMode();
        }
    });
    window.addEventListener('keyup', (e) => keyStates[e.key.toLowerCase()] = false);

    // Start animation
    animate();
}

// Create animated sky with clouds
function createSky() {
    // Create Sky object from Three.js
    const sky = new THREE.Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    // Add Sun
    const sunPosition = new THREE.Vector3();

    // Add effective sun and control parameters
    const effectController = {
        turbidity: 0,
        rayleigh: 3,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.152,
        elevation: 10,
        azimuth: 180,
        exposure: 0.5 // Fixed value instead of renderer.toneMappingExposure
    };

    // Apply initial control parameters to the sky
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = effectController.turbidity;
    uniforms.rayleigh.value = effectController.rayleigh;
    uniforms.mieCoefficient.value = effectController.mieCoefficient;
    uniforms.mieDirectionalG.value = effectController.mieDirectionalG;

    // Calculate sun position
    const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
    const theta = THREE.MathUtils.degToRad(effectController.azimuth);
    sunPosition.setFromSphericalCoords(1, phi, theta);
    uniforms.sunPosition.value.copy(sunPosition);

    // Set the exposure value
    if (renderer.toneMappingExposure !== undefined) {
        renderer.toneMappingExposure = effectController.exposure;
    }

    // Create a directional light to represent the sun
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.copy(sunPosition);
    sunLight.position.multiplyScalar(450000);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    // Add clouds if needed
    // createClouds();
}

// Create clouds for the sky
function createClouds() {
    // Create a base cloud material that will be reused
    const cloudMaterial = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        flatShading: true
    });

    // Create base sphere geometries of various sizes that will be reused
    const cloudGeometries = [];
    for (let i = 0; i < 5; i++) {
        cloudGeometries.push(new THREE.SphereGeometry(5 + i * 3, 8, 8));
    }

    // Create a few clouds at random positions
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * 1800 - 900;
        const y = 200 + Math.random() * 50;
        const z = Math.random() * 1800 - 900;
        const size = 15 + Math.random() * 15;
        createCloud(x, y, z, size, cloudMaterial, cloudGeometries);
    }
}

// Create a single cloud composed of several spheres
function createCloud(x, y, z, size, cloudMaterial, cloudGeometries) {
    const cloudGroup = new THREE.Group();
    const parts = 5 + Math.floor(Math.random() * 5);

    for (let i = 0; i < parts; i++) {
        const geometryIndex = Math.floor(Math.random() * cloudGeometries.length);
        // Create a cloud part by cloning a base mesh with our geometry and material
        const baseCloudPart = new THREE.Mesh(cloudGeometries[geometryIndex], cloudMaterial);
        const cloudPart = baseCloudPart.clone();

        // Scale the part based on our desired size
        const scale = size * (0.5 + Math.random() * 0.5) / 10;
        cloudPart.scale.set(scale, scale, scale);

        // Position the cloud parts to form a cluster
        cloudPart.position.set(
            (Math.random() - 0.5) * size,
            (Math.random() - 0.5) * size * 0.3,
            (Math.random() - 0.5) * size
        );

        cloudGroup.add(cloudPart);
    }

    cloudGroup.position.set(x, y, z);
    cloudGroup.speed = 0.2 + Math.random() * 0.5; // Different speeds for clouds
    clouds.push(cloudGroup);
    scene.add(cloudGroup);

    return cloudGroup;
}

// Update sky elements (clouds, color)
function updateSky(deltaTime) {
    // Move clouds
    clouds.forEach(cloud => {
        cloud.position.x += cloud.speed * deltaTime;

        // If cloud moves too far, reset to the other side
        if (cloud.position.x > 900) {
            cloud.position.x = -900;
            cloud.position.z = Math.random() * 1800 - 900;
        }
    });

}

// Handle window resize
function onWindowResize() {
    if (!gameStarted) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

class Cybertruck {
    constructor(licensePlateImg) {
        this.speed = 5;
        this.acceleration = 0; // Initialize acceleration to prevent NaN errors
        this.wireframes = false;
        this.width = 8;
        this.height = 7.5;
        this.depth = 23;
        this.mesh = new THREE.Object3D();

        let W = this.width,
            H = this.height,
            D = this.depth,
            flipXVertices = a => [-a[0], a[1], a[2]],
            toVectors = a => new THREE.Vector3(W * a[0], H * a[1], D * a[2]);

        // I. Body
        let bodyVerticesArr = [
            // back (0–3)
            [-0.45, 0.26, -0.5],
            [0.45, 0.26, -0.5],
            [-0.45, -0.1, -0.48],
            [0.45, -0.1, -0.48],
            // top (4–5)
            [-0.326, 0.5, 0.08],
            [0.326, 0.5, 0.08],
            // middle (6–19)
            [-0.45, -0.1, -0.38],
            [0.45, -0.1, -0.38],
            [-0.45, 0.06, -0.36],
            [0.45, 0.06, -0.36],
            [-0.45, 0.06, -0.24],
            [0.45, 0.06, -0.24],
            [-0.45, -0.15, -0.18],
            [0.45, -0.15, -0.18],
            [-0.45, -0.17, 0.255],
            [0.45, -0.17, 0.255],
            [-0.45, 0.06, 0.303],
            [0.45, 0.06, 0.303],
            [-0.45, 0.06, 0.42],
            [0.45, 0.06, 0.42],
            // upper front (20–23)
            [-0.45, 0.08, 0.47],
            [0.45, 0.08, 0.47],
            [-0.33, 0.045, 0.5],
            [0.33, 0.045, 0.5],
            // lower front (24–27)
            [-0.45, -0.13, 0.46],
            [0.45, -0.13, 0.46],
            [-0.343, -0.13, 0.488],
            [0.343, -0.13, 0.488],
            // bottom flaps (28–31)
            [-0.41, -0.21, -0.173],
            [0.41, -0.21, -0.173],
            [-0.41, -0.23, 0.25],
            [0.41, -0.23, 0.25],
            // windows (32–39)
            [-0.4225, 0.27, -0.14],
            [0.4225, 0.27, -0.14],
            [-0.379, 0.39, -0.13],
            [0.379, 0.39, -0.13],
            [-0.337, 0.47, 0.08],
            [0.337, 0.47, 0.08],
            [-0.425, 0.17, 0.36],
            [0.425, 0.17, 0.36]
        ];
        let bodyVertices = bodyVerticesArr.map(toVectors);
        let bodyFacesArr = [
            [0, 1, 3],
            [3, 2, 0],
            [0, 4, 5],
            [5, 1, 0],
            [5, 37, 35],
            [1, 5, 35],
            [1, 35, 33],
            [33, 21, 1],
            [39, 21, 33],
            [5, 21, 37],
            [21, 39, 37],
            [4, 34, 36],
            [0, 34, 4],
            [0, 32, 34],
            [32, 0, 20],
            [38, 32, 20],
            [4, 36, 20],
            [20, 36, 38],
            [20, 18, 24],
            [20, 0, 18],
            [18, 0, 16],
            [16, 0, 10],
            [10, 0, 8],
            [8, 0, 2],
            [2, 6, 8],
            [16, 10, 14],
            [12, 14, 10],
            [14, 12, 28],
            [28, 30, 14],
            [21, 25, 19],
            [21, 19, 1],
            [19, 17, 1],
            [17, 11, 1],
            [11, 9, 1],
            [1, 9, 7],
            [7, 3, 1],
            [11, 17, 15],
            [15, 13, 11],
            [15, 31, 29],
            [29, 13, 15],
            [5, 4, 20],
            [20, 21, 5],
            [21, 20, 22],
            [22, 23, 21],
            [22, 20, 24],
            [24, 26, 22],
            [23, 22, 26],
            [26, 27, 23],
            [23, 27, 25],
            [25, 21, 23],
            [2, 3, 7],
            [7, 6, 2],
            [6, 7, 9],
            [9, 8, 6],
            [8, 9, 11],
            [11, 10, 8],
            [10, 11, 13],
            [13, 12, 10],
            [12, 13, 29],
            [29, 28, 12],
            [28, 29, 31],
            [31, 30, 28],
            [30, 31, 15],
            [15, 14, 30],
            [14, 15, 17],
            [17, 16, 14],
            [16, 17, 19],
            [19, 18, 16],
            [18, 19, 25],
            [25, 24, 18],
            [24, 25, 26],
            [25, 27, 26],
            [34, 32, 33],
            [33, 35, 34],
            [34, 35, 37],
            [37, 36, 34],
            [36, 37, 39],
            [39, 38, 36],
            [33, 32, 38],
            [38, 39, 33]
        ];
        let bodyGeo = createBufferGeometry(bodyVertices, bodyFacesArr);
        let bodyMat = new THREE.MeshStandardMaterial({
            color: 0x6B7079,
            wireframe: this.wireframes,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
        let bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.add(bodyMesh);

        // II. Top Parts – Windows and Lights
        let windowMat = new THREE.MeshPhysicalMaterial({
            color: 0x101010,
            wireframe: this.wireframes,
            // transparent: true,
            // opacity: 0.8,      // More opaque
            metalness: 0.8,    // Slight metal look
            roughness: 1,    // Smooth surface (more reflective)
            reflectivity: 1.0, // Maximum reflectivity
            clearcoat: 1.0,    // Glass-like coating
            // wireframe: this.wireframes,
            // polygonOffset: false,
            // polygonOffsetFactor: 2,  // Different offset factor to prevent z-fighting with body
            // polygonOffsetUnits: 1,
            // side: THREE.DoubleSide  // Render both sides of the mesh
        });
        let lightMat = new THREE.MeshBasicMaterial({
            color: 0x101010,
            wireframe: this.wireframes,
            polygonOffset: true,
            polygonOffsetFactor: 3,  // Different offset factor to prevent z-fighting
            polygonOffsetUnits: 1
        });
        let topWindowVerticesArr = [
            [-0.371, 0.415, -0.13],
            [0.371, 0.415, -0.13],
            [-0.326, 0.5, 0.08],
            [0.326, 0.5, 0.08],
            [-0.4145, 0.2, 0.36],
            [0.4145, 0.2, 0.36]
        ];

        let topWindowVertices = topWindowVerticesArr.map(toVectors);
        let topWindowFacesArr = [
            [1, 0, 2],
            [2, 3, 1],
            [3, 2, 4],
            [4, 5, 3]
        ];
        let topWindowGeo = createBufferGeometry(topWindowVertices, topWindowFacesArr);
        let topWindowMesh = new THREE.Mesh(topWindowGeo, windowMat);
        this.mesh.add(topWindowMesh);

        // III. Side Windows
        let sideWindowsVerticesArr = [
            [-0.4, 0.27, -0.14],
            [0.4, 0.27, -0.14],
            [-0.351, 0.39, -0.13],
            [0.351, 0.39, -0.13],
            [-0.315, 0.47, 0.08],
            [0.315, 0.47, 0.08],
            [-0.43, 0.17, 0.36],
            [0.43, 0.17, 0.36]
        ];
        let sideWindowsVertices = sideWindowsVerticesArr.map(toVectors);
        let sideWindowsFacesArr = [
            [2, 3, 1],
            [1, 0, 2],
            [2, 4, 5],
            [5, 3, 2],
            [4, 6, 7],
            [7, 5, 4],
            [4, 2, 0],
            [0, 6, 4],
            [5, 7, 1],
            [1, 3, 5],
            [0, 1, 7],
            [7, 6, 0]
        ];
        let sideWindowsGeo = createBufferGeometry(sideWindowsVertices, sideWindowsFacesArr);
        let sideWindowsMesh = new THREE.Mesh(sideWindowsGeo, windowMat);
        this.mesh.add(sideWindowsMesh);

        // IV. Front Lights
        let frontLightVerticesArr = [
            [-0.45, 0.075, 0.4701],
            [-0.33, 0.04, 0.4999],
            [0.33, 0.04, 0.4999],
            [0.45, 0.075, 0.4701],
            [-0.45, 0.043, 0.4685],
            [-0.3315, 0.02, 0.4985],
            [0.3315, 0.02, 0.4985],
            [0.45, 0.043, 0.4685]
        ];
        let frontLightVertices = frontLightVerticesArr.map(toVectors);
        let frontLightFacesArr = [
            [1, 0, 4],
            [4, 5, 1],
            [2, 1, 5],
            [5, 6, 2],
            [3, 2, 6],
            [6, 7, 3]
        ];
        let frontLightGeo = createBufferGeometry(frontLightVertices, frontLightFacesArr);
        let frontLightMesh = new THREE.Mesh(frontLightGeo, lightMat);
        this.mesh.add(frontLightMesh);

        // V. Back Light – using PlaneGeometry (unchanged)
        let backLightGeo = new THREE.PlaneGeometry(W * 0.9, H * 0.06);
        backLightGeo.translate(0, H * 0.03, 0);
        let backLightMat = new THREE.MeshStandardMaterial({
            color: 0x101010,
            wireframe: this.wireframes
        });
        let backLight = new THREE.Mesh(backLightGeo, backLightMat);
        backLight.position.set(0, H * 0.26, D * -0.5);
        backLight.rotation.set(171 * Math.PI / 180, 0, 0);
        // Back light inner and areas use PlaneGeometry – unchanged
        let backLightInnerGeo = new THREE.PlaneGeometry(W * 0.9 - H * 0.04, H * 0.02);
        backLightInnerGeo.translate(0, H * 0.03, 0);
        let backLightInnerMat = new THREE.MeshBasicMaterial({
            color: 0xd65a65,
            wireframe: this.wireframes
        });
        let backLightInner = new THREE.Mesh(backLightInnerGeo, backLightInnerMat);
        backLightInner.position.set(0, 0, 0.01);
        backLight.add(backLightInner);
        let backLightAreaGeo = new THREE.PlaneGeometry(W * 0.18, H * 0.02);
        backLightAreaGeo.translate(0, H * 0.03, 0);
        let backLightAreaMat = new THREE.MeshBasicMaterial({
            color: 0xfdffb8,
            wireframe: this.wireframes
        });
        let backLightArea2 = new THREE.Mesh(backLightAreaGeo, backLightAreaMat);
        backLightArea2.position.set(0, 0, 0.01);
        backLightInner.add(backLightArea2);
        let backLightArea1 = backLightArea2.clone();
        backLightArea1.position.set(W * -0.33, 0, 0.01);
        backLightInner.add(backLightArea1);
        let backLightArea3 = backLightArea2.clone();
        backLightArea3.position.set(W * 0.33, 0, 0.01);
        backLightInner.add(backLightArea3);
        this.mesh.add(backLight);

        // VI. Wheels (using CylinderBufferGeometry – unchanged)
        const wheelGeo = new THREE.CylinderBufferGeometry(H * 0.25, H * 0.25, W * 0.3, 32);
        const wheelMat = new THREE.MeshLambertMaterial({
            color: 0x1c1c1c,
            wireframe: this.wireframes
        });
        this.wheels = [new THREE.Mesh(wheelGeo, wheelMat)];
        let wheelHub = new THREE.Object3D();
        wheelHub.position.y = W * 0.0025;
        this.wheels[0].add(wheelHub);
        let hubBaseGeo = new THREE.CylinderBufferGeometry(H * 0.16, H * 0.17, W * 0.01, 7);
        let hubBaseMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            wireframe: this.wireframes
        });
        let hubBase = new THREE.Mesh(hubBaseGeo, hubBaseMat);
        wheelHub.add(hubBase);
        let hubCenterGeo = new THREE.TorusBufferGeometry(H * 0.03, H * 0.03, 4, 7);
        let hubCenter = new THREE.Mesh(hubCenterGeo, hubBaseMat);
        hubCenter.position.y = W * 0.005;
        hubCenter.rotation.x = -Math.PI / 2;
        hubCenter.rotation.z = 3 / 28 * Math.PI * 2;
        hubBase.add(hubCenter);
        let hubCenterPlateGeo = new THREE.CircleBufferGeometry(H * 0.03, 7);
        let hubCenterPlate = new THREE.Mesh(hubCenterPlateGeo, hubBaseMat);
        hubCenterPlate.position.z = W * 0.025;
        hubCenter.add(hubCenterPlate);

        let spokeVerticesArr = [
            [-0.02, -0.063, -0.003],
            [0.02, -0.063, -0.003],
            [-0.02, 0.03, -0.003],
            [0.02, 0.03, -0.003],
            [-0.02, 0.063, -0.003],
            [0.02, 0.063, -0.003],
            [-0.015, -0.063, 0.003],
            [0.015, -0.063, 0.003],
            [-0.015, 0.03, 0.003],
            [0.015, 0.03, 0.003]
        ];
        let spokeVertices = spokeVerticesArr.map(toVectors);
        let spokeFacesArr = [
            [5, 4, 8],
            [8, 9, 5],
            [9, 8, 6],
            [6, 7, 9],
            [4, 2, 8],
            [5, 9, 3],
            [3, 9, 7],
            [7, 1, 3],
            [8, 2, 0],
            [0, 6, 8]
        ];
        let spokeGeo = createBufferGeometry(spokeVertices, spokeFacesArr);
        // Translate the entire spoke geometry upward
        spokeGeo.translate(0, H * 0.1135, 0);
        let spoke = new THREE.Mesh(spokeGeo, hubBaseMat);
        spoke.rotation.z = 3 / 28 * Math.PI * 2;
        hubCenter.add(spoke);
        for (let s = 1; s < 7; ++s) {
            let spokeClone = spoke.clone();
            spokeClone.rotation.z += ((Math.PI * 2) / 7) * s;
            hubCenter.add(spokeClone);
        }
        this.wheels[0].position.set(W * 0.43, H * -0.17, D * 0.36); // Front right wheel
        this.wheels[0].rotation.z = -Math.PI / 2;
        this.wheels[0].castShadow = true;
        this.wheels[0].receiveShadow = true;
        this.mesh.add(this.wheels[0]);

        this.wheels.push(this.wheels[0].clone());
        this.wheels[1].position.set(W * -0.43, H * -0.17, D * 0.36); // Front left wheel
        this.wheels[1].rotation.z = Math.PI / 2;
        this.mesh.add(this.wheels[1]);

        this.wheels.push(this.wheels[0].clone());
        this.wheels[2].position.set(W * 0.43, H * -0.17, D * -0.3); // Back right wheel
        this.wheels[2].rotation.z = -Math.PI / 2;
        this.mesh.add(this.wheels[2]);

        this.wheels.push(this.wheels[0].clone());
        this.wheels[3].position.set(W * -0.43, H * -0.17, D * -0.3); // Back left wheel
        this.wheels[3].rotation.z = Math.PI / 2;
        this.mesh.add(this.wheels[3]);

        // VII. Light Effects
        this.headlight = new THREE.SpotLight(0x30d2d5, 0);
        this.headlight.position.set(0, 0, this.depth * 0.48);
        this.headlight.target.position.set(0, 0, this.depth / 2 + 0.1);
        this.headlight.angle = 75 * Math.PI / 180;
        this.headlight.penumbra = 0.2;
        this.headlight.distance = -10;
        this.headlight.castShadow = true;
        this.headlight.shadow.mapSize = new THREE.Vector2(512, 512);
        this.mesh.add(this.headlight);
        this.mesh.add(this.headlight.target);
        this.rearlight = new THREE.SpotLight(0xd65a65, 0);
        this.rearlight.position.set(0, 0, -this.depth * 0.42);
        this.rearlight.target.position.set(0, 0, -this.depth / 2 - 0.1);
        this.rearlight.angle = 60 * Math.PI / 180;
        this.rearlight.penumbra = 0.2;
        this.rearlight.distance = 10;
        this.rearlight.castShadow = true;
        this.rearlight.shadow.mapSize = new THREE.Vector2(512, 512);
        this.mesh.add(this.rearlight);
        this.mesh.add(this.rearlight.target);
    }
    move() {
        // Optional movement logic can be added here if needed.
    }

    // Add this function to the Cybertruck class to create materials with polygon offset
    createMaterial(color, wireframe = false) {
        const material = new THREE.MeshPhongMaterial({
            color,
            wireframe,
            polygonOffset: true,
            polygonOffsetFactor: 1, // positive value pushes the surface away from the camera
            polygonOffsetUnits: 1
        });
        return material;
    }
}


// ***** Modified createCar() to use Cybertruck *****
function createCar() {
    const textureLoader = new THREE.TextureLoader();
    const licensePlate = textureLoader.load("https://assets.codepen.io/416221/license-plate.png");
    const truck = new Cybertruck(licensePlate);
    car = truck.mesh;
    wheels = truck.wheels;
    car.position.set(0, 3, 0);
    scene.add(car);
}

// Generate a chunk of terrain at specified coordinates
function generateChunk(chunkX, chunkZ) {
    const chunkGroup = new THREE.Group();
    const chunkWorldX = chunkX * CHUNK_SIZE;
    const chunkWorldZ = chunkZ * CHUNK_SIZE;

    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 10, 10);

    let groundMaterial;
    // Beach chunks near the water
    if (Math.abs(chunkX) % 5 === 0 || Math.abs(chunkZ) % 5 === 0) {
        groundMaterial = new THREE.MeshPhongMaterial({ color: 0xE1C699 }); // Sand color
    } else {
        groundMaterial = new THREE.MeshPhongMaterial({ color: 0x5D8233 }); // Grass color
    }

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(chunkWorldX, 0, chunkWorldZ);
    ground.receiveShadow = true;
    chunkGroup.add(ground);

    // Only create road in chunks where chunkX is 0 (center line)
    if (chunkX === 0) {
        // Create road with improved texture
        const textureLoader = new THREE.TextureLoader();
        const roadTexture = textureLoader.load("https://assets.codepen.io/416221/road.jpg");

        // Configure road texture
        roadTexture.wrapS = THREE.RepeatWrapping;
        roadTexture.wrapT = THREE.RepeatWrapping;
        roadTexture.repeat.set(1, 10);

        const roadGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, CHUNK_SIZE);
        const roadMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff, // grey,
            map: roadTexture,
            bumpMap: roadTexture,
            opacity: 0.5,
            bumpScale: 0.5
        });

        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.set(chunkWorldX, 0.01, chunkWorldZ);
        road.receiveShadow = true;
        chunkGroup.add(road);

        // Add road markings
        const markingGeometry = new THREE.PlaneGeometry(0.5, 5);
        const markingMaterial = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });

        for (let i = -CHUNK_SIZE / 2 + 10; i < CHUNK_SIZE / 2; i += 20) {
            const marking = new THREE.Mesh(markingGeometry, markingMaterial);
            marking.rotation.x = -Math.PI / 2;
            marking.position.set(chunkWorldX, 0.02, chunkWorldZ + i);
            chunkGroup.add(marking);
        }
    }

    // Add environmental elements
    addEnvironmentalElements(chunkGroup, chunkWorldX, chunkWorldZ);

    // Add reward items on the road only if this is a road chunk
    if (chunkX === 0) {
        addRewardItems(chunkGroup, chunkWorldX, chunkWorldZ);
    }

    return chunkGroup;
}

// Add trees, rocks, and other environmental elements to a chunk
function addEnvironmentalElements(chunkGroup, chunkWorldX, chunkWorldZ) {
    // Create texture loader
    const textureLoader = new THREE.TextureLoader();

    // Seed-based pseudo-random generator for consistent terrain
    const seed = Math.abs(chunkWorldX + chunkWorldZ * 10000);
    const randomFromSeed = (n) => {
        return ((Math.sin(n) * 10000) % 1 + 1) % 1;
    };

    // Determine biome based on position
    const biomeValue = (Math.sin(chunkWorldX * 0.01) + Math.cos(chunkWorldZ * 0.01)) * 0.5;
    let biome;

    if (biomeValue < -0.3) {
        biome = 'desert'; // Desert biome with cacti
    } else if (biomeValue < 0.3) {
        biome = 'grassland'; // Grassland with bushes and sparse trees
    } else {
        biome = 'forest'; // Dense forest
    }

    // Add trees - frequency based on biome
    let numTrees = 0;
    if (biome === 'forest') {
        numTrees = 15 + Math.floor(randomFromSeed(seed * 2) * 10);
    } else if (biome === 'grassland') {
        numTrees = 3 + Math.floor(randomFromSeed(seed * 2) * 5);
    } else {
        numTrees = Math.floor(randomFromSeed(seed * 2) * 3); // Very few trees in desert
    }

    for (let i = 0; i < numTrees; i++) {
        const x = (randomFromSeed(seed + i * 2) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldX;
        const z = (randomFromSeed(seed + i * 2 + 1) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldZ;

        // Don't place trees on the road
        if (Math.abs(x - chunkWorldX) < ROAD_WIDTH / 2 + 3) continue;

        // Randomly select tree type based on biome
        let treeType;
        if (biome === 'desert') {
            treeType = 'palm';
        } else if (biome === 'grassland') {
            treeType = randomFromSeed(seed + i * 3) < 0.7 ? 'oak' : 'pine';
        } else {
            // Forest has a mix of trees with pine being more common
            treeType = randomFromSeed(seed + i * 3) < 0.6 ? 'pine' : 'oak';
        }

        // Create the tree based on type with much larger scale (3-5x larger)
        const baseScale = 3 + randomFromSeed(seed + i * 4) * 5; // This will give trees 3-5x their original size
        const treeObj = createTree(treeType, x, z, baseScale);
        treeObj.position.set(x, 0, z);
        treeObj.castShadow = true;
        treeObj.userData = {
            type: 'tree',
            treeType: treeType,
            destructible: true,
            destroyed: false,
            health: 100
        };

        // Add to collidable objects for collision detection
        collidableObjects.push(treeObj);

        chunkGroup.add(treeObj);
    }

    // Add rocks
    const numRocks = 2;
    // Load rock texture once and reuse
    const rockTexture = textureLoader.load('https://raw.githubusercontent.com/saikatkumardey/vibecar/6209affccb02862da81138e8452f98241e5e1860/assets/skins/rock_texture.png');

    // Configure rock texture for better performance
    rockTexture.wrapS = THREE.RepeatWrapping;
    rockTexture.wrapT = THREE.RepeatWrapping;
    rockTexture.repeat.set(1, 1);
    rockTexture.minFilter = THREE.LinearFilter;
    rockTexture.magFilter = THREE.LinearFilter;

    // Create rock material once and reuse
    const rockMat = new THREE.MeshPhongMaterial({
        map: rockTexture,
        shininess: 1
    });

    for (let i = 0; i < numRocks; i++) {
        const x = (randomFromSeed(seed + i * 4 + 100) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldX;
        const z = (randomFromSeed(seed + i * 4 + 101) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldZ;

        // Don't place rocks on the road
        if (Math.abs(x - chunkWorldX) < ROAD_WIDTH / 2 + 50) continue;

        const rockSize = randomFromSeed(seed + i) * 2.5 + 10;
        const rockGeo = new THREE.DodecahedronGeometry(rockSize, 1); // Reduced geometry complexity
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(x, rockSize / 2, z);
        rock.rotation.set(
            randomFromSeed(seed + i * 2) * Math.PI,
            randomFromSeed(seed + i * 3) * Math.PI,
            randomFromSeed(seed + i * 4) * Math.PI
        );
        rock.castShadow = true;
        rock.userData = {
            type: 'rock',
            destructible: false
        };

        // Add to collidable objects
        collidableObjects.push(rock);

        chunkGroup.add(rock);
    }

    // Add vegetation based on biome
    const vegetationCount = biome === 'desert' ? 10 : (biome === 'grassland' ? 50 : 20);

    for (let i = 0; i < vegetationCount; i++) {
        const x = (randomFromSeed(seed + i * 5 + 200) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldX;
        const z = (randomFromSeed(seed + i * 5 + 201) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldZ;

        // Don't place vegetation on the road
        if (Math.abs(x - chunkWorldX) < ROAD_WIDTH / 2 + 0.5) continue;

        let vegType;
        if (biome === 'desert') {
            vegType = randomFromSeed(seed + i * 6) < 0.7 ? 'cactus' : 'bush';
        } else if (biome === 'grassland') {
            vegType = randomFromSeed(seed + i * 6) < 0.8 ? 'grass' : 'bush';
        } else {
            vegType = randomFromSeed(seed + i * 6) < 0.5 ? 'bush' : 'grass';
        }

        const vegetation = createVegetation(vegType, x, z, randomFromSeed(seed + i * 7) * 0.5 + 2);
        vegetation.position.set(x, 0, z);

        if (vegType === 'cactus') {
            // Cacti are collidable
            vegetation.userData = {
                type: 'cactus',
                destructible: true,
                destroyed: false,
                health: 50
            };
            collidableObjects.push(vegetation);
        }

        chunkGroup.add(vegetation);
    }
}

// Cached geometries and materials for trees to improve performance
const treeGeometries = {
    pine: {
        trunk: null,
        foliage1: null,
        foliage2: null,
        foliage3: null
    },
    oak: {
        trunk: null,
        foliage: null
    },
    palm: {
        trunk: null,
        leaves: null
    },
    cactus: {
        main: null,
        arm1: null,
        arm2: null
    }
};

const treeMaterials = {
    trunk: null,
    pineFoliage: null,
    oakFoliage: null,
    palmLeaves: null,
    cactus: null
};

// Initialize tree geometries and materials
function initTreeAssets() {
    // Trunk materials
    treeMaterials.trunk = new THREE.MeshPhongMaterial({ color: 0x8B4513 });

    // Foliage materials
    treeMaterials.pineFoliage = new THREE.MeshPhongMaterial({ color: 0x2E8B57 });
    treeMaterials.oakFoliage = new THREE.MeshPhongMaterial({ color: 0x1d741d });
    treeMaterials.palmLeaves = new THREE.MeshPhongMaterial({ color: 0x4CAF50 });
    treeMaterials.cactus = new THREE.MeshPhongMaterial({ color: 0x4D8E57 });

    // Pine tree geometries
    treeGeometries.pine.trunk = new THREE.CylinderGeometry(0.2, 0.3, 4, 8);
    treeGeometries.pine.foliage1 = new THREE.ConeGeometry(1.5, 4, 8);
    treeGeometries.pine.foliage2 = new THREE.ConeGeometry(1.8, 3, 8);
    treeGeometries.pine.foliage3 = new THREE.ConeGeometry(2, 3, 8);

    // Oak tree geometries
    treeGeometries.oak.trunk = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
    treeGeometries.oak.foliage = new THREE.SphereGeometry(2, 10, 10);

    // Palm tree geometries
    treeGeometries.palm.trunk = new THREE.CylinderGeometry(0.2, 0.3, 5, 8);
    treeGeometries.palm.leaves = new THREE.ConeGeometry(2, 1, 8);

    // Cactus geometries
    treeGeometries.cactus.main = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
    treeGeometries.cactus.arm1 = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
    treeGeometries.cactus.arm2 = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
}

// Create different tree types using cloning
function createTree(type, x, z, scale) {
    const treeGroup = new THREE.Group();

    // Initialize tree assets if not already done
    if (!treeMaterials.trunk) {
        initTreeAssets();
    }

    if (type === 'pine') {
        // Pine tree with cone-shaped leaves
        const trunk = new THREE.Mesh(treeGeometries.pine.trunk, treeMaterials.trunk);
        trunk.position.y = 2 * scale;
        trunk.scale.set(scale, scale, scale);
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Multiple cones for pine tree foliage
        const foliage1 = new THREE.Mesh(treeGeometries.pine.foliage1, treeMaterials.pineFoliage);
        foliage1.position.y = 4 * scale;
        foliage1.scale.set(scale, scale, scale);
        foliage1.castShadow = true;
        treeGroup.add(foliage1);

        const foliage2 = new THREE.Mesh(treeGeometries.pine.foliage2, treeMaterials.pineFoliage);
        foliage2.position.y = 2.5 * scale;
        foliage2.scale.set(scale, scale, scale);
        foliage2.castShadow = true;
        treeGroup.add(foliage2);

        const foliage3 = new THREE.Mesh(treeGeometries.pine.foliage3, treeMaterials.pineFoliage);
        foliage3.position.y = 1 * scale;
        foliage3.scale.set(scale, scale, scale);
        foliage3.castShadow = true;
        treeGroup.add(foliage3);
    } else if (type === 'oak') {
        // Oak tree with round foliage
        const trunk = new THREE.Mesh(treeGeometries.oak.trunk, treeMaterials.trunk);
        trunk.position.y = 1.5 * scale;
        trunk.scale.set(scale, scale, scale);
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Large spherical foliage for oak
        const foliage = new THREE.Mesh(treeGeometries.oak.foliage, treeMaterials.oakFoliage);
        foliage.position.y = 4 * scale;
        foliage.scale.set(scale, scale, scale);
        foliage.castShadow = true;
        treeGroup.add(foliage);
    } else if (type === 'palm') {
        // Palm tree with bent trunk and fronds
        const trunk = new THREE.Mesh(treeGeometries.palm.trunk, treeMaterials.trunk);
        trunk.position.y = 2.5 * scale;
        trunk.scale.set(scale, scale, scale);
        trunk.castShadow = true;

        // Apply a slight bend to the trunk
        trunk.geometry = trunk.geometry.clone();
        const trunkVertices = trunk.geometry.attributes.position;
        const trunkBendAmount = 0.15;
        for (let i = 0; i < trunkVertices.count; i++) {
            const y = trunkVertices.getY(i);
            if (y > 0) {
                // Apply a sine curve to bend the trunk
                const bendFactor = y / (5 * scale);
                trunkVertices.setX(i, trunkVertices.getX(i) + Math.sin(bendFactor * Math.PI) * trunkBendAmount * scale);
            }
        }
        trunkVertices.needsUpdate = true;

        treeGroup.add(trunk);

        // Create palm fronds
        const frondCount = 7;
        for (let i = 0; i < frondCount; i++) {
            const frond = new THREE.Mesh(treeGeometries.palm.leaves, treeMaterials.palmLeaves);

            // Position fronds in a circular pattern at the top
            frond.position.y = 5 * scale;

            // Create a slight curve in each frond
            frond.rotation.x = 0.2; // Tilt downward
            frond.rotation.y = (i / frondCount) * Math.PI * 2; // Distribute around trunk
            frond.scale.set(scale, scale, scale);

            treeGroup.add(frond);
        }
    } else if (type === 'cactus') {
        // Cactus for desert biomes
        const main = new THREE.Mesh(treeGeometries.cactus.main, treeMaterials.cactus);
        main.position.y = 2 * scale;
        main.scale.set(scale, scale, scale);
        main.castShadow = true;
        treeGroup.add(main);

        // Add arms to the cactus
        const arm1 = new THREE.Mesh(treeGeometries.cactus.arm1, treeMaterials.cactus);
        arm1.position.set(0.6 * scale, 3 * scale, 0);
        arm1.rotation.z = Math.PI / 4; // Angle upward
        arm1.scale.set(scale, scale, scale);
        arm1.castShadow = true;
        treeGroup.add(arm1);

        const arm2 = new THREE.Mesh(treeGeometries.cactus.arm2, treeMaterials.cactus);
        arm2.position.set(-0.6 * scale, 2.5 * scale, 0);
        arm2.rotation.z = -Math.PI / 4; // Angle upward in opposite direction
        arm2.scale.set(scale, scale, scale);
        arm2.castShadow = true;
        treeGroup.add(arm2);
    } else {
        // Fallback to a simple tree if type is not recognized
        console.warn(`Unknown tree type: ${type}, falling back to pine`);

        // Create a simple pine tree as fallback
        const trunk = new THREE.Mesh(treeGeometries.pine.trunk, treeMaterials.trunk);
        trunk.position.y = 2 * scale;
        trunk.scale.set(scale, scale, scale);
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const foliage = new THREE.Mesh(treeGeometries.pine.foliage1, treeMaterials.pineFoliage);
        foliage.position.y = 4 * scale;
        foliage.scale.set(scale, scale, scale);
        foliage.castShadow = true;
        treeGroup.add(foliage);
    }

    return treeGroup;
}

// Create different vegetation types
function createVegetation(type, x, z, scale) {
    const vegetationGroup = new THREE.Group();

    if (type === 'grass') {
        // Simple grass - several thin rectangular planes in a cross pattern
        const grassMat = new THREE.MeshPhongMaterial({
            color: 0x7CFC00,
            side: THREE.DoubleSide
        });

        const bladeCount = 5 + Math.floor(Math.random() * 5);

        for (let i = 0; i < bladeCount; i++) {
            const height = (0.5 + Math.random() * 0.5) * scale;
            const width = 0.1 * scale;

            const bladeGeo = new THREE.PlaneGeometry(width, height);
            const blade = new THREE.Mesh(bladeGeo, grassMat);

            // Position randomly in a small circle
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 0.2 * scale;

            blade.position.set(
                Math.sin(angle) * distance,
                height / 2,
                Math.cos(angle) * distance
            );

            // Rotate randomly
            blade.rotation.y = Math.random() * Math.PI;
            // Slight random tilt
            blade.rotation.x = (Math.random() * 0.2) - 0.1;

            vegetationGroup.add(blade);
        }

    } else if (type === 'bush') {
        // Small bush - cluster of small spheres
        const bushMat = new THREE.MeshPhongMaterial({ color: 0x228B22 });

        const mainSphereGeo = new THREE.SphereGeometry(0.5 * scale, 8, 8);
        const mainSphere = new THREE.Mesh(mainSphereGeo, bushMat);
        mainSphere.position.y = 0.5 * scale;
        vegetationGroup.add(mainSphere);

        // Add a few smaller spheres around the main one
        const smallSphereCount = 3 + Math.floor(Math.random() * 3);

        for (let i = 0; i < smallSphereCount; i++) {
            const smallSize = 0.3 * scale;
            const smallSphereGeo = new THREE.SphereGeometry(smallSize, 8, 8);
            const smallSphere = new THREE.Mesh(smallSphereGeo, bushMat);

            const angle = (i / smallSphereCount) * Math.PI * 2;
            smallSphere.position.set(
                Math.sin(angle) * 0.4 * scale,
                0.5 * scale + (Math.random() * 0.2 - 0.1) * scale,
                Math.cos(angle) * 0.4 * scale
            );

            vegetationGroup.add(smallSphere);
        }

    } else if (type === 'cactus') {
        // Cactus - main body with arms
        const cactusMat = new THREE.MeshPhongMaterial({ color: 0x2E8B57 });

        // Main body
        const mainBodyGeo = new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 2 * scale, 8);
        const mainBody = new THREE.Mesh(mainBodyGeo, cactusMat);
        mainBody.position.y = 1 * scale;
        vegetationGroup.add(mainBody);

        // Add cactus arms
        const armCount = Math.floor(Math.random() * 3); // 0-2 arms

        for (let i = 0; i < armCount; i++) {
            const armGeo = new THREE.CylinderGeometry(0.15 * scale, 0.15 * scale, 1 * scale, 8);
            const arm = new THREE.Mesh(armGeo, cactusMat);

            // Position the arm halfway up the main body
            const armY = 1 * scale + (Math.random() * 0.6 - 0.3) * scale;
            const angle = Math.random() * Math.PI * 2;

            // Start by positioning arm at the edge of the main body
            arm.position.set(
                Math.sin(angle) * 0.3 * scale,
                armY,
                Math.cos(angle) * 0.3 * scale
            );

            // Rotate the arm outward
            arm.rotation.z = Math.PI / 2 - angle; // Point outward

            // Offset the arm to connect it to the main body
            arm.position.x += Math.sin(angle) * 0.5 * scale;
            arm.position.z += Math.cos(angle) * 0.5 * scale;

            vegetationGroup.add(arm);
        }
    }

    return vegetationGroup;
}

// Create a destroyed version of a tree for collision effect
function createDestroyedTree(tree, impactForce) {
    const destroyedGroup = new THREE.Group();
    destroyedGroup.position.copy(tree.position);

    // Get the tree type from userData
    const treeType = tree.userData.treeType || 'pine';

    // Create fallen trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);

    // Lay the trunk on its side in the direction of impact
    trunk.rotation.z = Math.PI / 2;
    trunk.position.y = 0.4; // Half the trunk diameter

    // Randomly scatter debris based on impact force
    const debrisCount = Math.min(10, Math.floor(impactForce / 10));

    for (let i = 0; i < debrisCount; i++) {
        // Create small debris pieces
        const size = 0.2 + Math.random() * 0.3;
        let debrisGeo;

        // Different debris shapes
        if (i % 3 === 0) {
            debrisGeo = new THREE.BoxGeometry(size, size, size);
        } else if (i % 3 === 1) {
            debrisGeo = new THREE.ConeGeometry(size, size * 2, 5);
        } else {
            debrisGeo = new THREE.SphereGeometry(size, 4, 4);
        }

        const isLeaf = i > debrisCount / 2;
        const debrisMat = new THREE.MeshPhongMaterial({
            color: isLeaf ? 0x228B22 : 0x8B4513
        });

        const debris = new THREE.Mesh(debrisGeo, debrisMat);

        // Scatter around the tree
        const scatterDist = impactForce * 0.1;
        debris.position.set(
            (Math.random() - 0.5) * scatterDist,
            Math.random() * 0.5,
            (Math.random() - 0.5) * scatterDist
        );

        // Random rotation
        debris.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        destroyedGroup.add(debris);
    }

    destroyedGroup.add(trunk);
    destroyedGroup.userData = {
        type: 'destroyedTree',
        destructible: false
    };

    return destroyedGroup;
}

// Create a tighter collision box for an object
function createTightCollisionBox(object) {
    const box = new THREE.Box3();
    box.setFromObject(object);

    // Get the dimensions
    const size = new THREE.Vector3();
    box.getSize(size);

    // For the car, make the collision box tighter
    if (object === car) {
        // Reduce width by 20%
        size.x *= 0.8;
        // Reduce height by 30%
        size.y *= 0.7;
        // Reduce depth by 10%
        size.z *= 0.9;

        // Create a new box with adjusted dimensions
        const center = new THREE.Vector3();
        box.getCenter(center);
        box.set(
            new THREE.Vector3(center.x - size.x / 2, center.y - size.y / 2, center.z - size.z / 2),
            new THREE.Vector3(center.x + size.x / 2, center.y + size.y / 2, center.z + size.z / 2)
        );
    }

    return box;
}

// Check collisions and handle them
function checkCollisions() {
    // Don't check collisions if the game is over
    if (isGameOver) return;

    // Update car collision box with tighter bounds
    carCollisionBox = createTightCollisionBox(car);

    const currentTime = performance.now();

    // Check collision with each object
    for (let i = 0; i < collidableObjects.length; i++) {
        const object = collidableObjects[i];

        // Skip already destroyed objects
        if (object.userData.destroyed) continue;

        // Get distance to object first (quick check)
        const distance = car.position.distanceTo(object.position);

        // Only do detailed collision check if object is close enough
        if (distance > 20) continue;  // Skip if too far

        // Update object collision box with tighter bounds
        objectCollisionBox = createTightCollisionBox(object);

        // Check for collision
        if (carCollisionBox.intersectsBox(objectCollisionBox)) {
            // Calculate collision normal (direction of impact)
            const carCenter = new THREE.Vector3();
            carCollisionBox.getCenter(carCenter);
            const objectCenter = new THREE.Vector3();
            objectCollisionBox.getCenter(objectCenter);

            // Direction from car to object
            const collisionNormal = new THREE.Vector3().subVectors(objectCenter, carCenter).normalize();

            // Calculate relative velocity for collision response
            const relativeVelocity = Math.max(5, Math.abs(carSpeed));

            // Calculate impact force based on speed and angle
            const impactAngle = Math.abs(collisionNormal.dot(carVelocity.clone().normalize()));
            const impactForce = relativeVelocity * (0.5 + impactAngle * 0.5);

            // Check if this is a rock - specifically look for the rock hazard type
            if (object.userData.hazardType === 'rock') {
                console.log("Hit a rock! Impact force:", impactForce);
                if (isGameOver) {
                    return;
                }

                // Play a collision effect without destroying the rock
                createRockCollisionEffect(object.position.clone(), object.userData.size * 0.5);

                // Apply damage to car
                if (currentTime - lastCollisionTime > damageCooldown) {
                    damageCarFromCollision(object.userData.damage * 0.7); // Reduced damage
                    lastCollisionTime = currentTime;
                }

                // Apply physics impulse to the car based on collision
                const rockMass = object.userData.mass;
                const carMass = 20; // Estimated car mass
                const restitution = 0.7; // Bounciness factor

                // Calculate impulse magnitude (simplified physics)
                const impulseMagnitude = (1 + restitution) * relativeVelocity *
                    (rockMass / (carMass + rockMass));

                // Apply impulse to car velocity
                const impulseVector = collisionNormal.clone().multiplyScalar(impulseMagnitude);

                // Modify car's speed and rotation based on impulse
                // Reduce forward speed
                carSpeed *= 0.7;

                // Add sideways push based on collision angle
                const sideImpulse = impulseVector.x * Math.cos(carRotation) +
                    impulseVector.z * Math.sin(carRotation);

                // Apply rotation effect based on side impact
                carRotation += sideImpulse * 0.02;

                // Also push the rock away slightly
                const rockPushAngle = Math.atan2(
                    car.position.z - object.position.z,
                    car.position.x - object.position.x
                );

                // Update rock direction based on collision
                object.userData.directionAngle = rockPushAngle;
                // Increase rock speed temporarily from the impact
                object.userData.speed += impulseMagnitude * 0.5;

                // Play collision sound
                playCollisionSound(impactForce);

                continue; // Skip rest of processing for this object
            }

            // Process tree collisions (existing code)
            if (object.userData.type === 'tree' && !object.userData.destroyed) {
                // Update tree to damaged state
                createDestroyedTree(object, impactForce);

                // Continue with damage calculation
                if (currentTime - lastCollisionTime > damageCooldown) {
                    damageCarFromCollision(impactForce);
                    lastCollisionTime = currentTime;
                }
            }
        }
    }
}

// Create a visual effect when a rock is hit
function createRockCollisionEffect(position, size) {
    // Create a simplified particle system with fewer particles
    const particleCount = Math.min(10, Math.floor(10 * size)); // Limit max particles
    const particleGeometry = new THREE.BufferGeometry();

    // Create arrays for positions and velocities
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    // Create rock debris particles with random positions
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Position around impact point with random offset
        positions[i3] = position.x + (Math.random() - 0.5) * size;
        positions[i3 + 1] = position.y + (Math.random() - 0.5) * size;
        positions[i3 + 2] = position.z + (Math.random() - 0.5) * size;

        // Random velocity - mostly upward and outward
        velocities[i3] = (Math.random() - 0.5) * 2; // x
        velocities[i3 + 1] = Math.random() * 3; // y (up)
        velocities[i3 + 2] = (Math.random() - 0.5) * 2; // z
    }

    // Set attributes for the geometry
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    // Create material with simplified settings
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xbbbbbb,
        size: size * 0.2,
        transparent: true,
        opacity: 0.7
    });

    // Create the particle system
    const particles = new THREE.Points(particleGeometry, particleMaterial);

    // Set lifetime
    particles.userData = {
        createdAt: performance.now(),
        lifetime: 1000 // 1 second (shorter than before)
    };

    // Add to scene
    scene.add(particles);

    // Simplify the update function - use fewer calculations per frame
    const updateParticles = (timestamp) => {
        const age = timestamp - particles.userData.createdAt;
        const lifeRatio = age / particles.userData.lifetime;

        // Remove if lifetime exceeded
        if (lifeRatio >= 1) {
            scene.remove(particles);
            return;
        }

        // Update positions based on velocity - fewer calculations per frame
        const positions = particles.geometry.attributes.position.array;
        const velocities = particles.geometry.attributes.velocity.array;

        for (let i = 0; i < positions.length; i += 3) {
            // Apply velocity with simplified physics
            positions[i] += velocities[i] * 0.015; // x
            positions[i + 1] += velocities[i + 1] * 0.015 - 0.09; // y with simplified gravity
            positions[i + 2] += velocities[i + 2] * 0.015; // z

            // Apply simplified gravity
            velocities[i + 1] -= 0.15;
        }

        particles.geometry.attributes.position.needsUpdate = true;

        // Fade out with age - simplified
        particles.material.opacity = 0.7 * (1 - lifeRatio);

        // Request next update
        requestAnimationFrame(updateParticles);
    };

    // Start update loop
    requestAnimationFrame(updateParticles);

    // Play a rock impact sound
    playCollisionSound(Math.min(15, 8 + size * 2)); // Limit max volume
}

// Damage the car from collision
function damageCarFromCollision(impactForce) {
    // Calculate damage based on impact force
    const damage = Math.min(50, impactForce * 0.5);
    carHealth -= damage;

    // Ensure health doesn't go below 0
    if (carHealth < 0) carHealth = 0;

    // Update health bar
    updateHealthBar();

    // Visual feedback - flash red
    flashDamageIndicator();

    // Play collision sound
    playCollisionSound(impactForce);

    // Check for game over
    if (carHealth <= 0) {
        gameOver();
    }
}

// Update the health bar display
function updateHealthBar() {
    // Update health bar width based on current health
    healthFill.style.width = carHealth + '%';

    // Change color based on health
    if (carHealth > 60) {
        healthFill.style.background = 'linear-gradient(90deg, #00ff00, #5aff15)';
    } else if (carHealth > 30) {
        healthFill.style.background = 'linear-gradient(90deg, #ffff00, #ffc800)';
    } else {
        healthFill.style.background = 'linear-gradient(90deg, #ff0000, #ff6600)';
    }
}

// Flash the screen red to indicate damage
function flashDamageIndicator() {
    // Create a full-screen red overlay with glass effect
    const overlay = document.createElement('div');
    overlay.className = 'glass-overlay damage-overlay';

    document.body.appendChild(overlay);

    // Fade out and remove
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 500);
    }, 100);
}

// Update which chunks should be visible based on car position
function updateChunks() {
    const chunkX = Math.floor(car.position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(car.position.z / CHUNK_SIZE);

    if (chunkX === currentChunkCoords.x && chunkZ === currentChunkCoords.z && Object.keys(chunks).length > 0) {
        return; // No need to update if we're in the same chunk and have at least some chunks
    }

    currentChunkCoords.x = chunkX;
    currentChunkCoords.z = chunkZ;

    // Remove distant chunks
    Object.keys(chunks).forEach(key => {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - chunkX) > RENDER_DISTANCE ||
            Math.abs(cz - chunkZ) > RENDER_DISTANCE) {
            terrain.remove(chunks[key]);
            delete chunks[key];
        }
    });

    // Add new chunks
    for (let x = chunkX - RENDER_DISTANCE; x <= chunkX + RENDER_DISTANCE; x++) {
        for (let z = chunkZ - RENDER_DISTANCE; z <= chunkZ + RENDER_DISTANCE; z++) {
            const key = `${x},${z}`;
            if (!chunks[key]) {
                const chunk = generateChunk(x, z);
                chunks[key] = chunk;
                terrain.add(chunk);
            }
        }
    }
}

// Handle player input and update car position and rotation
function handleInput(deltaTime) {
    // Store previous speed for acceleration/deceleration detection
    previousSpeed = carSpeed;

    // Steering
    if (keyStates['a'] || keyStates['arrowleft']) {
        carRotation += deltaTime * 0.2 * (carSpeed / 30);

        // Play tire screech when turning at high speed
        if (Math.abs(carSpeed) > 50) {
            playTireScreechSound();
        }
    }
    if (keyStates['d'] || keyStates['arrowright']) {
        carRotation -= deltaTime * 0.1 * (carSpeed / 30);

        // Play tire screech when turning at high speed
        if (Math.abs(carSpeed) > 50) {
            playTireScreechSound();
        }
    }

    // Acceleration and braking
    const acceleration = 20;
    const maxSpeed = 180;
    const deceleration = 15;
    const brakeStrength = 40;

    if (keyStates['w'] || keyStates['arrowup']) {
        carSpeed += acceleration * deltaTime;
        if (carSpeed > maxSpeed) carSpeed = maxSpeed;
    } else if (keyStates['s'] || keyStates['arrowdown']) {
        if (carSpeed > 0) {
            carSpeed -= brakeStrength * deltaTime;

            // Play tire screech when braking hard at high speed
            if (previousSpeed > 50 && carSpeed < previousSpeed - 10) {
                playTireScreechSound();
            }
        } else {
            carSpeed -= acceleration * deltaTime;
            if (carSpeed < -maxSpeed / 2) carSpeed = -maxSpeed / 2; // Max reverse speed is half
        }
    } else {
        // Natural deceleration
        if (Math.abs(carSpeed) < deceleration * deltaTime) {
            carSpeed = 0;
        } else if (carSpeed > 0) {
            carSpeed -= deceleration * deltaTime;
        } else {
            carSpeed += deceleration * deltaTime;
        }
    }

    // Reset car position
    if (keyStates['r']) {
        car.position.set(0, 3, 0);
        carSpeed = 0;
        carRotation = 0;
    }

    // Toggle mute
    if (keyStates['m'] && !keyStates['m_prev']) {
        toggleMute();
    }
    keyStates['m_prev'] = keyStates['m'];

    // Update car position based on speed and rotation
    car.rotation.y = carRotation;

    const moveX = Math.sin(carRotation) * carSpeed * deltaTime;
    const moveZ = Math.cos(carRotation) * carSpeed * deltaTime;

    car.position.x += moveX;
    car.position.z += moveZ;

    // Simulate wheel rotation based on speed
    const wheelRotationSpeed = carSpeed * deltaTime * 0.3 + 0.5;
    wheels.forEach(wheel => {
        wheel.rotation.x -= wheelRotationSpeed;
    });

    // Update speed indicator
    infoElement.textContent = `Speed: ${Math.abs(carSpeed).toFixed(0)} km/h`;

    // Update speedometer
    const speedValue = Math.abs(carSpeed).toFixed(0);
    document.getElementById('speed-value').textContent = speedValue;

    // Update speed indicator arc with smooth animation
    const speedPercent = Math.min(100, Math.abs(carSpeed)) / 100;
    const speedIndicator = document.getElementById('speed-indicator');
    const startAngle = Math.PI;
    const endAngle = 0;
    const angle = startAngle + (endAngle - startAngle) * speedPercent;
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    speedIndicator.setAttribute('d', `M10,50 A40,40 0 0,1 ${x},${y}`);

    // Update speed value color based on speed with glow effect
    const speedValueElement = document.getElementById('speed-value');
    if (speedValue > 80) {
        speedValueElement.style.color = '#ff5555';
        speedValueElement.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
    } else if (speedValue > 40) {
        speedValueElement.style.color = '#ffff00';
        speedValueElement.style.textShadow = '0 0 10px rgba(255, 255, 0, 0.5)';
    } else {
        speedValueElement.style.color = '#55ff55';
        speedValueElement.style.textShadow = '0 0 10px rgba(0, 255, 0, 0.5)';
    }
}

// Position the camera to follow the car
function updateCamera() {
    if (useOrbitControls) {
        // When using orbit controls, update controls target to follow the car
        if (controls) {
            controls.target.set(
                car.position.x,
                car.position.y + 20, // Look at a lower point
                car.position.z + 40
            );
        }
        return; // Skip the rest of the function
    }

    const cameraOffset = new THREE.Vector3();
    cameraOffset.set(0, 12, -40); // Lower height and closer to car
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotation);

    camera.position.x = car.position.x + cameraOffset.x;
    camera.position.y = car.position.y + cameraOffset.y;
    camera.position.z = car.position.z + cameraOffset.z;

    camera.lookAt(
        car.position.x,
        car.position.y, // Look at a lower point
        car.position.z
    );
}

// Toggle between orbit controls and car-following camera
function toggleCameraMode() {
    useOrbitControls = !useOrbitControls;

    if (useOrbitControls) {
        // Switch to orbit controls
        controls.enabled = true;
        // Set initial position when switching to orbit
        controls.target.set(
            car.position.x,
            car.position.y + 3,
            car.position.z
        );
    } else {
        // Switch to car-following camera
        controls.enabled = false;
        // Immediately update camera to car position
        updateCamera();
    }

    console.log("Camera mode: " + (useOrbitControls ? "Orbit Controls" : "Car Following"));
}

// Main animation loop
function animate() {
    requestAnimationFrame(animate);

    // Update orbit controls if they exist
    if (controls) {
        controls.update();
    }

    // Calculate FPS using a moving average
    const currentTime = performance.now();
    const deltaMs = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    if (!gameStarted) return;

    // Add current fps to buffer - only sample every other frame for better performance
    if (Math.floor(currentTime / 50) % 2 === 0) {
        fpsBuffer.push(1000 / deltaMs);
        // Keep buffer at the right size
        while (fpsBuffer.length > fpsBufferSize) {
            fpsBuffer.shift();
        }

        // Update FPS display every 10 frames for better readability
        if (fpsBuffer.length % 10 === 0) {
            const averageFps = fpsBuffer.reduce((a, b) => a + b, 0) / fpsBuffer.length;
            const fpsElement = document.getElementById('fps');
            fpsElement.textContent = `FPS: ${Math.round(averageFps)}`;

            // Color coding based on performance
            if (averageFps > 50) {
                fpsElement.style.color = '#00ff00'; // Green for good performance
            } else if (averageFps > 30) {
                fpsElement.style.color = '#ffff00'; // Yellow for acceptable performance
            } else {
                fpsElement.style.color = '#ff0000'; // Red for poor performance
            }
        }
    }

    // Use deltaMs instead of the Three.js clock for consistent timing
    const deltaTime = Math.min(deltaMs / 1000, 0.1); // Cap deltaTime to prevent huge jumps

    // Only process inputs if game is not over
    if (!isGameOver) {
        handleInput(deltaTime);
    } else {
        // Update camera position every frame
        gameOver();
    }

    // Update camera position every frame
    updateCamera();

    // Spread out expensive operations across frames
    const frameId = Math.floor(currentTime / 16); // ~60fps target

    // Always update chunks for continuous world generation
    updateChunks();

    // Stagger less critical updates
    if (frameId % 2 === 0) {
        // Every other frame
        updateRewards(deltaTime);
    }

    if (frameId % 3 === 0) {
        // Every third frame
        updateSky(deltaTime * 3); // Compensate for less frequent updates
    }

    // Always update rocks (gameplay critical)
    updateRollingRocks(deltaTime);

    // Update engine sound less frequently
    if (frameId % 4 === 0) {
        updateEngineSound();
    }

    // Always check collisions for gameplay
    checkCollisions();

    // Render the scene
    renderer.render(scene, camera);
}

// Add reward items to the road in a chunk
function addRewardItems(chunkGroup, chunkWorldX, chunkWorldZ) {
    // Seed-based pseudo-random generator for consistent rewards
    const seed = Math.abs(chunkWorldX * 3 + chunkWorldZ * 7321);
    const randomFromSeed = (n) => {
        return ((Math.sin(n) * 10000) % 1 + 1) % 1;
    };

    // Determine if this chunk should have rewards
    const shouldHaveRewards = randomFromSeed(seed) < 0.7; // 70% chance for a chunk to have rewards

    if (!shouldHaveRewards) return;

    // Determine if we should create a health pickup (if health is not already 100%)
    const shouldHaveHealth = randomFromSeed(seed + 500) < 0.15 && carHealth < 100;

    // Add a health pickup if needed
    if (shouldHaveHealth) {
        // Position on the road
        const z = (randomFromSeed(seed + 42) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldZ;
        // Keep it on the road but not perfectly centered
        const roadOffset = (randomFromSeed(seed + 33) - 0.5) * (ROAD_WIDTH * 0.7);
        const x = chunkWorldX + roadOffset;

        const reward = createRewardItem('health', x, z);
        reward.userData = {
            type: 'reward',
            rewardType: 'health',
            collected: false
        };

        rewardItems.push(reward);
        chunkGroup.add(reward);
    }

    // Add random balloons on the road (replacing coin chains)
    const numBalloons = 5 + Math.floor(randomFromSeed(seed + 100) * 10); // 5-15 balloons per chunk

    const balloonTypes = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

    for (let i = 0; i < numBalloons; i++) {
        // Position balloons randomly along the road
        const z = (randomFromSeed(seed + i * 42) * CHUNK_SIZE - CHUNK_SIZE / 2) + chunkWorldZ;

        // Keep it on the road but with some variation
        const roadOffset = (randomFromSeed(seed + i * 33) - 0.5) * (ROAD_WIDTH * 0.7);
        const x = chunkWorldX + roadOffset;

        // Select random balloon type
        const balloonType = balloonTypes[Math.floor(randomFromSeed(seed + i * 77) * balloonTypes.length)];

        // Create balloon at calculated position
        const reward = createRewardItem(balloonType, x, z);
        reward.userData = {
            type: 'reward',
            rewardType: 'points',
            balloonType: balloonType,
            collected: false
        };

        rewardItems.push(reward);
        chunkGroup.add(reward);
    }
}

// Create a reward item with animation using cloning
function createRewardItem(type, x, z) {
    // Initialize assets if not already done
    if (!rewardAssets.initialized) {
        initRewardAssets();
    }

    let reward;

    // Clone the appropriate base mesh based on type
    if (type === 'health' && rewardAssets.baseMeshes.health) {
        reward = rewardAssets.baseMeshes.health.clone();
    }
    else if (type === 'points' && rewardAssets.baseMeshes.points) {
        reward = rewardAssets.baseMeshes.points.clone();
    }
    else if (type === 'time' && rewardAssets.baseMeshes.time) {
        reward = rewardAssets.baseMeshes.time.clone();
    }
    else if (type === 'coin' && rewardAssets.baseMeshes.coin) {
        reward = rewardAssets.baseMeshes.coin.clone();
    }
    else {
        // Fallback if the requested type isn't available or assets aren't initialized
        reward = new THREE.Group();
        const fallbackGeo = new THREE.SphereGeometry(1, 16, 16);
        const fallbackMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
        const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
        reward.add(fallbackMesh);
    }

    // Position the reward
    reward.position.set(x, 1.5, z);

    // Add animations and glow effects
    // Add hovering animation
    reward.userData.hoverAnimation = {
        phase: Math.random() * Math.PI * 2,
        amplitude: 0.2,
        speed: 1.5 + Math.random() * 0.5,
        baseHeight: 1.5
    };

    // Add rotation animation
    reward.userData.rotateAnimation = {
        speed: 0.5 + Math.random() * 0.5
    };

    return reward;
}

// Update reward items animation
function updateRewards(deltaTime) {
    const time = performance.now() / 1000;

    // Limit the number of rewards we update each frame
    const maxUpdatesPerFrame = 15;
    const activeRewards = rewardItems.filter(reward => !reward.userData.collected);

    // Only process a subset of rewards per frame if there are too many
    const rewardsToUpdate = activeRewards.length <= maxUpdatesPerFrame ?
        activeRewards :
        activeRewards.slice(Math.floor(time * 10) % Math.max(1, activeRewards.length - maxUpdatesPerFrame),
            Math.floor(time * 10) % Math.max(1, activeRewards.length - maxUpdatesPerFrame) + maxUpdatesPerFrame);

    for (let i = 0; i < rewardsToUpdate.length; i++) {
        const reward = rewardsToUpdate[i];

        // Simplified animation - use fewer calculations
        // Float up and down with simplified math
        const floatHeight = reward.userData.floatHeight || 0.3; // Reduced range
        const floatSpeed = reward.userData.floatSpeed || 1;
        const timeOffset = reward.position.x * 100 + reward.position.z; // Use position for offset instead of storing extra data

        // Simplify the sin calculation by using a lower precision
        reward.position.y = (reward.userData.baseHeight || 4) +
            Math.sin((time + timeOffset * 0.001) * floatSpeed) * floatHeight;

        // Rotate slightly - use simplified rotation
        reward.rotation.y += deltaTime * 0.5;

        // Simplify balloon-specific animations
        if (reward.userData.rewardType === 'points') {
            // Apply only the most visually important effect: slight swaying
            reward.rotation.z = Math.sin((time + timeOffset * 0.001) * 0.3) * 0.08;
        }
    }

    // Check for reward collection every time
    checkRewardCollection();
}

// Animate reward being collected - balloon burst effect
function animateRewardCollection(reward) {
    // For balloons, create a burst effect
    if (reward.userData.rewardType === 'points') {
        // Create small particle pieces of the balloon
        const burstParticles = [];
        const baseColor = reward.children[0].material.color.clone();
        const numParticles = 15;

        // Create burst group
        const burstGroup = new THREE.Group();
        burstGroup.position.copy(reward.position);
        scene.add(burstGroup);

        // Create particles
        for (let i = 0; i < numParticles; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.2, 6, 6);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: baseColor,
                transparent: true,
                opacity: 1
            });

            const particle = new THREE.Mesh(particleGeometry, particleMaterial);

            // Random direction for explosion
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = 0.2 + Math.random() * 0.3;

            particle.position.set(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );

            // Store velocity for animation
            particle.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 5,
                    (Math.random() * 3) + 2,
                    (Math.random() - 0.5) * 5
                ),
                rotation: new THREE.Vector3(
                    Math.random() * 10,
                    Math.random() * 10,
                    Math.random() * 10
                )
            };

            burstGroup.add(particle);
            burstParticles.push(particle);
        }

        // Hide the original balloon
        reward.visible = false;

        // Animate particles
        let burstAnimation = 0;
        const animateParticles = setInterval(() => {
            burstAnimation++;

            for (const particle of burstParticles) {
                // Apply velocity
                particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.08));

                // Apply "gravity"
                particle.userData.velocity.y -= 0.15;

                // Apply rotation
                particle.rotation.x += particle.userData.rotation.x * 0.01;
                particle.rotation.y += particle.userData.rotation.y * 0.01;
                particle.rotation.z += particle.userData.rotation.z * 0.01;

                // Fade out
                if (particle.material.opacity > 0) {
                    particle.material.opacity -= 0.03;
                }

                // Shrink slightly
                particle.scale.multiplyScalar(0.97);
            }

            // End the animation after 30 frames
            if (burstAnimation > 30) {
                clearInterval(animateParticles);
                scene.remove(burstGroup);
            }
        }, 16); // ~60fps
    } else {
        // For health pickups, use the original scale-up and fade effect
        const scaleUp = setInterval(() => {
            reward.scale.multiplyScalar(1.1);

            // Make children transparent
            reward.traverse(child => {
                if (child.isMesh && child.material) {
                    if (!child.material.transparent) {
                        child.material = child.material.clone();
                        child.material.transparent = true;
                    }
                    child.material.opacity -= 0.1;
                }
            });

            if (reward.scale.x > 3) clearInterval(scaleUp);
        }, 50);
    }
}

// Check if car has collected any rewards
function checkRewardCollection() {
    carCollisionBox.setFromObject(car);

    for (let i = 0; i < rewardItems.length; i++) {
        const reward = rewardItems[i];

        // Skip already collected rewards
        if (reward.userData.collected) continue;

        // Check collision
        objectCollisionBox.setFromObject(reward);

        if (carCollisionBox.intersectsBox(objectCollisionBox)) {
            // Mark as collected
            reward.userData.collected = true;

            // Apply reward effect
            if (reward.userData.rewardType === 'health') {
                // Increase health
                carHealth = Math.min(100, carHealth + 25);
                updateHealthBar();

                // Visual feedback
                flashHealthIndicator();
            } else {
                // Points effect (balloons)
                coinsCollected++; // Keep using the coins variable for score tracking
                document.getElementById('coins-count').textContent = `Score: ${coinsCollected}`;

                // Show balloon pop effect
                showBalloonPopup(reward.userData.balloonType || 'red');
            }

            // Play collect sound
            playCollectSound();

            // Make the reward disappear with animation
            animateRewardCollection(reward);

            // Remove from array later
            setTimeout(() => {
                const parent = reward.parent;
                if (parent) parent.remove(reward);

                rewardItems.splice(rewardItems.indexOf(reward), 1);
            }, 1000);
        }
    }
}

// Show balloon pop popup
function showBalloonPopup(balloonType) {
    const popup = document.getElementById('coin-chain-popup');

    // Apply glass-popup class (already added in HTML)
    if (!popup.classList.contains('glass-popup')) {
        popup.classList.add('glass-popup');
    }

    // Update content based on type
    switch (balloonType) {
        case 'health':
            popup.innerHTML = '+20 ❤️';
            popup.style.color = '#ff5555';
            break;
        case 'chain':
            popup.innerHTML = `×${currentChainCoins} 🎈`;
            popup.style.color = '#ffcc00';
            break;
        default:
            popup.innerHTML = '+1 🎈';
            popup.style.color = '#ffffff';
    }

    // Show popup with animation
    popup.style.display = 'block';
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%, 20px)';

    requestAnimationFrame(() => {
        popup.style.opacity = '1';
        popup.style.transform = 'translate(-50%, 0)';

        // Hide popup after animation
        setTimeout(() => {
            popup.style.opacity = '0';
            popup.style.transform = 'translate(-50%, -20px)';

            setTimeout(() => {
                popup.style.display = 'none';
            }, 300);
        }, 2000);
    });
}

// Flash health increase indicator
function flashHealthIndicator() {
    // Create a green overlay with glass effect
    const overlay = document.createElement('div');
    overlay.className = 'glass-overlay health-overlay';

    document.body.appendChild(overlay);

    // Fade out and remove
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 500);
    }, 100);
}

// Flash points indicator
function flashPointsIndicator() {
    // Create a gold overlay with glass effect
    const overlay = document.createElement('div');
    overlay.className = 'glass-overlay points-overlay';

    document.body.appendChild(overlay);

    // Fade out and remove
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 500);
    }, 100);
}

// Create a fallback collect sound
function createFallbackCollectSound() {
    // Handled by TuneJS
    console.log("Using Tone.js collect sound");
}

// Play collect sound
function playCollectSound() {
    if (isMuted || !audioContext) return;

    try {
        if (collectSound === 'fallback') {
            // Play synthesized collect sound
            const collectOsc = audioContext.createOscillator();
            collectOsc.type = 'sawtooth';
            collectOsc.frequency.value = 500;

            const collectGain = audioContext.createGain();
            collectGain.gain.value = 0.1;

            // Create noise effect
            const noiseFilter = audioContext.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.value = 1000;
            noiseFilter.Q.value = 0.5;

            collectOsc.connect(noiseFilter);
            noiseFilter.connect(collectGain);
            collectGain.connect(masterGainNode);

            collectOsc.start();
            collectOsc.stop(audioContext.currentTime + 0.3);
        } else if (collectSound) {
            // Play the loaded sound
            const source = audioContext.createBufferSource();
            source.buffer = collectSound;

            const collectGain = audioContext.createGain();
            collectGain.gain.value = 0.2;

            source.connect(collectGain);
            collectGain.connect(masterGainNode);

            source.start();
        }
    } catch (e) {
        console.error("Error playing collect sound:", e);
    }
}

// Global audio functions
function loadEngineSound() {
    // Implementation...
}

// Global function to toggle mute - this is called when user presses 'M'
function toggleMute() {
    // This function is called when the user presses 'M'
    // Since this is a user interaction, we can use it to initialize audio if needed

    // If tuneJS doesn't exist yet, we can create it now
    if (!window.tuneJS) {
        try {
            console.log("Creating audio system from mute toggle");

            // Create and start Tone.js
            Tone.start().then(() => {
                console.log("Tone.js context started from mute button");

                // Create audio manager
                window.tuneJS = new TuneJS();

                // Initialize audio
                window.tuneJS.initializeAudio();

                // This will be unmuted by default, so toggle to muted state
                window.tuneJS.toggleMute();
                console.log("Audio initialized and muted from toggleMute");
            }).catch(e => {
                console.error("Failed to create audio from mute toggle:", e);
            });
        } catch (e) {
            console.error("Error initializing audio from mute toggle:", e);
        }
        return;
    }

    // If tuneJS exists but isn't initialized, initialize it
    if (window.tuneJS && !window.tuneJS.audioInitialized) {
        try {
            // Try to initialize audio since this is a user gesture
            Tone.start().then(() => {
                console.log("Initializing audio from mute toggle");
                window.tuneJS.initializeAudio();
                window.tuneJS.toggleMute(); // Toggle to muted since this is a mute request
                console.log("Audio initialized and muted");
            }).catch(e => {
                console.error("Failed to initialize audio from mute toggle:", e);
            });
        } catch (e) {
            console.error("Error initializing audio from mute toggle:", e);
        }
        return;
    }

    // Normal toggle behavior if audio is already initialized
    const isMuted = window.tuneJS.toggleMute();
    console.log("Audio " + (isMuted ? "muted" : "unmuted"));
}

// Cached rock assets for better performance
const rockAssets = {
    geometries: [],
    materials: [],
    glowMaterial: null,
    initialized: false
};

// Initialize rock assets
function initRockAssets() {
    if (rockAssets.initialized) return;

    // Create a few different rock geometries and materials for variety
    const segments = 12;

    // Create different sizes and deformations
    for (let i = 0; i < 3; i++) {
        rockAssets.geometries.push(new THREE.IcosahedronGeometry(2.5, 1));
    }

    // Create different rock materials for variety
    rockAssets.materials.push(
        new THREE.MeshStandardMaterial({
            color: 0xaa4422,
            roughness: 0.9,
            metalness: 0.3,
            emissive: 0x331100,
            emissiveIntensity: 0.5
        })
    );

    rockAssets.materials.push(
        new THREE.MeshStandardMaterial({
            color: 0xdd6633,
            roughness: 0.9,
            metalness: 0.3,
            emissive: 0x331100,
            emissiveIntensity: 0.5
        })
    );

    // Create glow material
    rockAssets.glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });

    rockAssets.initialized = true;
}

function createRollingRock(x, z, size = 1) {
    // Initialize assets if not already done
    if (!rockAssets.initialized) {
        initRockAssets();
    }

    // Select random geometry and material from cached assets
    const geometryIndex = Math.floor(Math.random() * rockAssets.geometries.length);
    const materialIndex = Math.floor(Math.random() * rockAssets.materials.length);

    // Create mesh from cached geometry and material
    const rockGeometry = rockAssets.geometries[geometryIndex];
    const rockMaterial = rockAssets.materials[materialIndex];

    // Create the rock mesh
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);

    // Scale the rock based on size parameter
    rock.scale.set(size, size, size);

    // Position rocks higher off the ground so they're more visible
    rock.position.set(x, size * 2, z);

    rock.castShadow = true;
    rock.receiveShadow = true;

    // Add random rotation for visual interest
    rock.rotation.x = Math.random() * Math.PI;
    rock.rotation.y = Math.random() * Math.PI;
    rock.rotation.z = Math.random() * Math.PI;

    // Add a glowing outline to make rocks more visible
    const glowGeometry = new THREE.IcosahedronGeometry(size * 2.6, 1);
    const glow = new THREE.Mesh(glowGeometry, rockAssets.glowMaterial);
    rock.add(glow);

    // Store rock properties in userData
    rock.userData = {
        type: 'hazard',
        hazardType: 'rock',
        // Reduce speed so rocks are on screen longer
        speed: 2 + Math.random() * 5, // Speed range 2-7
        directionAngle: 0, // Will be set by spawnRandomRock
        rotationSpeed: {
            x: (Math.random() - 0.5) * 3,
            y: (Math.random() - 0.5) * 3,
            z: (Math.random() - 0.5) * 3
        },
        size: size,
        damage: 10 + size * 10, // More damage for larger rocks
        destroyed: false,
        createdAt: performance.now(), // Track when the rock was created
        mass: size * 2 // Property for physics calculations
    };

    // Add to scene and collidable objects
    scene.add(rock);
    collidableObjects.push(rock);
    rollingRocks.push(rock);

    return rock;
}

// Update and manage all rolling rocks
function updateRollingRocks(deltaTime) {
    if (isGameOver) return; // Don't spawn new rocks if game is over

    // Check if it's time to spawn a new rock
    const currentTime = performance.now();
    if (currentTime - lastRockSpawnTime > rockSpawnInterval) {
        // Spawn new rock
        spawnRandomRock();
        lastRockSpawnTime = currentTime;

        // Gradually increase difficulty by reducing spawn interval (but not below 2 seconds)
        rockSpawnInterval = Math.max(2000, rockSpawnInterval - 100);
    }

    // Update all existing rocks
    for (let i = 0; i < rollingRocks.length; i++) {
        const rock = rollingRocks[i];

        // Skip destroyed rocks
        if (rock.userData.destroyed) continue;

        // Move rock in the direction of its angle
        const speed = rock.userData.speed * deltaTime * 10;
        rock.position.x += Math.cos(rock.userData.directionAngle) * speed;
        rock.position.z += Math.sin(rock.userData.directionAngle) * speed;

        // Apply rolling rotation based on movement direction
        const rollAngle = rock.userData.directionAngle + Math.PI / 2; // Perpendicular to movement
        const rollAxis = new THREE.Vector3(Math.cos(rollAngle), 0, Math.sin(rollAngle));
        const rollAmount = speed * 0.1;

        // Apply rotation around the roll axis
        rock.rotateOnAxis(rollAxis.normalize(), rollAmount);

        // Additional random rotations for visual interest
        rock.rotation.x += rock.userData.rotationSpeed.x * deltaTime;
        rock.rotation.y += rock.userData.rotationSpeed.y * deltaTime;

        // Add a small bounce to make rocks more dynamic
        const age = (currentTime - rock.userData.createdAt) / 1000; // Age in seconds
        rock.position.y = rock.userData.size * 1.2 + Math.abs(Math.sin(age * 2)) * 0.5;

        // Remove rock if it's gone too far from the player
        const distanceToPlayer = new THREE.Vector2(
            rock.position.x - car.position.x,
            rock.position.z - car.position.z
        ).length();

        if (distanceToPlayer > CHUNK_SIZE * 1.5) {
            scene.remove(rock);

            // Remove from arrays
            const collidableIndex = collidableObjects.indexOf(rock);
            if (collidableIndex !== -1) {
                collidableObjects.splice(collidableIndex, 1);
            }

            rollingRocks.splice(i, 1);
            i--;
        }
    }
}

// Spawn a random rock near the road
function spawnRandomRock() {
    // Generate a random angle for spawning (0-360 degrees)
    const spawnAngle = Math.random() * Math.PI * 2;

    // Determine spawn distance from player (150-250 units)
    const spawnDistance = 150 + Math.random() * 100;

    // Calculate spawn position using polar coordinates
    const spawnX = car.position.x + Math.cos(spawnAngle) * spawnDistance;
    const spawnZ = car.position.z + Math.sin(spawnAngle) * spawnDistance;

    // Random size between 1.5-3.5
    const size = 1.5 + Math.random() * 2;

    // Create rock
    const rock = createRollingRock(spawnX, spawnZ, size);

    // Set direction toward the player (opposite of spawn angle)
    const directionAngle = Math.atan2(car.position.z - spawnZ, car.position.x - spawnX);
    rock.userData.directionAngle = directionAngle;

    // Add a point light to the rock to make it more visible
    const light = new THREE.PointLight(0xff4400, 1.2, 20);
    light.position.set(0, size * 0.5, 0);
    rock.add(light);
}

// Game over function
function gameOver() {
    if (isGameOver) return; // Prevent multiple calls

    console.log("GAME OVER - health reached zero");
    isGameOver = true;

    // Create game over overlay with glass effect
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.className = 'glass-popup';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    overlay.style.transition = 'opacity 1s ease';
    overlay.style.opacity = '0';

    // Game over text
    const gameOverText = document.createElement('h1');
    gameOverText.textContent = 'GAME OVER';
    gameOverText.style.fontSize = '5em';
    gameOverText.style.margin = '0 0 30px 0';
    gameOverText.style.textShadow = '0 0 10px #ff0000';
    gameOverText.style.color = '#ff0000';

    // Score display
    const scoreText = document.createElement('h2');
    scoreText.textContent = `Final Score: ${coinsCollected}`;
    scoreText.style.fontSize = '2em';
    scoreText.style.margin = '0 0 50px 0';
    scoreText.style.color = 'white';

    // Restart button
    const restartButton = document.createElement('button');
    restartButton.textContent = 'RESTART';
    restartButton.className = 'pulse-glow';
    restartButton.style.padding = '15px 40px';
    restartButton.style.fontSize = '1.5em';
    restartButton.style.background = 'linear-gradient(135deg, rgba(255, 51, 51, 0.9) 0%, rgba(204, 0, 0, 0.9) 100%)';
    restartButton.style.color = 'white';
    restartButton.style.border = 'none';
    restartButton.style.borderRadius = '50px';
    restartButton.style.cursor = 'pointer';
    restartButton.style.transition = 'all 0.3s ease';
    restartButton.style.boxShadow = '0 8px 24px rgba(255, 0, 0, 0.3)';

    restartButton.addEventListener('mouseover', () => {
        restartButton.style.background = 'linear-gradient(135deg, rgba(255, 0, 0, 0.95) 0%, rgba(204, 0, 0, 0.95) 100%)';
        restartButton.style.transform = 'scale(1.05) translateY(-2px)';
        restartButton.style.boxShadow = '0 12px 28px rgba(255, 0, 0, 0.4)';
    });

    restartButton.addEventListener('mouseout', () => {
        restartButton.style.background = 'linear-gradient(135deg, rgba(255, 51, 51, 0.9) 0%, rgba(204, 0, 0, 0.9) 100%)';
        restartButton.style.transform = 'scale(1)';
        restartButton.style.boxShadow = '0 8px 24px rgba(255, 0, 0, 0.3)';
    });

    restartButton.addEventListener('click', () => {
        // Create sliding doors for transition
        const leftDoor = document.createElement('div');
        leftDoor.id = 'restart-left-door';
        leftDoor.style.cssText = `
            position: absolute;
            top: 0;
            left: -50%;
            height: 100%;
            width: 50%;
            background: linear-gradient(135deg, rgba(30, 42, 120, 0.6) 0%, rgba(15, 22, 66, 0.6) 100%);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            z-index: 1001;
            transition: transform 0.8s cubic-bezier(0.7, 0, 0.3, 1);
        `;

        const rightDoor = document.createElement('div');
        rightDoor.id = 'restart-right-door';
        rightDoor.style.cssText = `
            position: absolute;
            top: 0;
            right: -50%;
            height: 100%;
            width: 50%;
            background: linear-gradient(135deg, rgba(30, 42, 120, 0.6) 0%, rgba(15, 22, 66, 0.6) 100%);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            z-index: 1001;
            transition: transform 0.8s cubic-bezier(0.7, 0, 0.3, 1);
        `;

        document.body.appendChild(leftDoor);
        document.body.appendChild(rightDoor);

        // Animate doors closing
        setTimeout(() => {
            leftDoor.style.transform = 'translateX(100%)';
            rightDoor.style.transform = 'translateX(-100%)';

            // Reload the page after doors close
            setTimeout(() => {
                window.location.reload();
            }, 800);
        }, 50);
    });

    // Append elements to overlay
    overlay.appendChild(gameOverText);
    overlay.appendChild(scoreText);
    overlay.appendChild(restartButton);

    // Add overlay to the document
    document.body.appendChild(overlay);

    // Fade in the overlay
    setTimeout(() => {
        overlay.style.opacity = '1';
    }, 100);

    // Stop player movement
    carVelocity.set(0, 0, 0);
    carSpeed = 0;
}

// Utility function to create glass UI overlays
function createGlassOverlay(message, type = 'info', duration = 3000) {
    // Create a glass overlay for UI messages
    const overlay = document.createElement('div');
    overlay.className = 'glass-popup';
    overlay.style.position = 'absolute';
    overlay.style.top = '50%';
    overlay.style.left = '50%';
    overlay.style.transform = 'translate(-50%, -50%)';
    overlay.style.padding = '20px 40px';
    overlay.style.zIndex = '500';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';

    // Set style based on type
    switch (type) {
        case 'success':
            overlay.style.borderLeft = '4px solid #00cc00';
            break;
        case 'warning':
            overlay.style.borderLeft = '4px solid #ffcc00';
            break;
        case 'error':
            overlay.style.borderLeft = '4px solid #ff0000';
            break;
        case 'info':
        default:
            overlay.style.borderLeft = '4px solid #00ccff';
            break;
    }

    // Add message
    overlay.textContent = message;

    // Add to document
    document.body.appendChild(overlay);

    // Fade in
    setTimeout(() => {
        overlay.style.opacity = '1';

        // Fade out and remove after duration
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 300);
        }, duration);
    }, 10);

    return overlay;
}