import * as THREE from 'three';
import './style.css';
import type { InventoryItem, ActivityLog, RequestRecord, UserDatabase, BorrowRecord } from './types';

// Global declarations for CDN libraries
declare const lucide: {
    createIcons: () => void;
};

// API URL
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

type UserRole = 'ADMIN' | 'MEMBER';

// Global state variables
let inventory: InventoryItem[] = [];
let logs: ActivityLog[] = [];
let requests: RequestRecord[] = [];
let selectedItem: InventoryItem | null = null;

// ==========================================
// 2. Three.js 3D Background Engine
// ==========================================
class Background3D {
    private canvas: HTMLCanvasElement;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    
    private particles!: THREE.Points;
    private particlePhases: Float32Array = new Float32Array(0);
    private currentTheme = 'cyberpunk';
    
    private mouseX = 0;
    private mouseY = 0;
    private targetCameraX = 0;
    private targetCameraY = 4;

    constructor() {
        this.canvas = document.getElementById('canvas-3d') as HTMLCanvasElement;
        if (!this.canvas) return;
        this.init();
        this.createLighting();
        this.createParticles();
        this.setupEvents();
        this.animate();
    }

    private init() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x06060e, 0.015);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 4, 18);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    private createLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xbd00ff, 1.5, 100);
        pointLight.position.set(0, 10, -20);
        this.scene.add(pointLight);

        const pointLight2 = new THREE.PointLight(0x00f0ff, 1.5, 100);
        pointLight2.position.set(20, 5, 10);
        this.scene.add(pointLight2);
    }

    public updateThemeColors(theme: string) {
        this.currentTheme = theme;
        let fogHex = 0x06060e;
        if (theme === 'matrix') fogHex = 0x020d07;
        else if (theme === 'midnight') fogHex = 0x060e20;
        else if (theme === 'light') fogHex = 0xf1f5f9;
        else if (theme === 'sakura') fogHex = 0xfce2ed;
        else if (theme === 'avengers') fogHex = 0x090a15;

        if (this.scene) {
            this.scene.fog = new THREE.FogExp2(fogHex, theme === 'sakura' ? 0.01 : 0.015);
        }

        this.setParticleColorsForTheme(theme);
    }

    private setParticleColorsForTheme(theme: string) {
        if (!this.particles) return;
        const colors = this.particles.geometry.attributes.color.array as Float32Array;
        const count = colors.length / 3;

        let color1 = new THREE.Color(0x00f0ff);
        let color2 = new THREE.Color(0xbd00ff);
        let color3 = new THREE.Color(0xff007a);

        if (theme === 'avengers') {
            color1 = new THREE.Color(0x00f0ff); // Stark Arc Cyan
            color2 = new THREE.Color(0xa855f7); // Wakanda Vibranium Purple
            color3 = new THREE.Color(0xef4444); // Iron Crimson Energy
        } else if (theme === 'sakura') {
            color1 = new THREE.Color(0xec4899); // Sakura Blossom Pink
            color2 = new THREE.Color(0xf43f5e); // Rose Petal Crimson
            color3 = new THREE.Color(0xf472b6); // Soft Blossom Rose
        } else if (theme === 'matrix') {
            color1 = new THREE.Color(0x00ff66);
            color2 = new THREE.Color(0x00cc44);
            color3 = new THREE.Color(0x33ff88);
        } else if (theme === 'midnight') {
            color1 = new THREE.Color(0x38bdf8);
            color2 = new THREE.Color(0x818cf8);
            color3 = new THREE.Color(0xc084fc);
        } else if (theme === 'light') {
            color1 = new THREE.Color(0x0284c7);
            color2 = new THREE.Color(0x7c3aed);
            color3 = new THREE.Color(0xdb2777);
        }

        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let c = color1;
            if (rand > 0.6) c = color2;
            else if (rand > 0.3) c = color3;

            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        this.particles.geometry.attributes.color.needsUpdate = true;
    }

    private createParticles() {
        const particleCount = 350;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        this.particlePhases = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 120;
            positions[i * 3 + 1] = Math.random() * 40 - 10;
            positions[i * 3 + 2] = (Math.random() - 0.7) * 150;
            this.particlePhases[i] = Math.random() * Math.PI * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.24,
            vertexColors: true,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
        this.setParticleColorsForTheme(this.currentTheme);
    }

    private setupEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        });
    }

    private animate() {
        requestAnimationFrame(() => this.animate());

        if (this.particles) {
            const positions = this.particles.geometry.attributes.position.array as Float32Array;
            const particleCount = positions.length / 3;
            const time = Date.now() * 0.001;

            for (let i = 0; i < particleCount; i++) {
                if (this.currentTheme === 'sakura') {
                    // Gentle falling & swaying Sakura Cherry Blossom petals
                    positions[i * 3 + 1] -= 0.035;
                    positions[i * 3] += Math.sin(time * 1.5 + this.particlePhases[i]) * 0.025;
                    positions[i * 3 + 2] += Math.cos(time * 1.0 + this.particlePhases[i]) * 0.015;

                    if (positions[i * 3 + 1] < -10) {
                        positions[i * 3 + 1] = 30;
                        positions[i * 3] = (Math.random() - 0.5) * 120;
                    }
                } else {
                    positions[i * 3 + 1] += 0.015;
                    positions[i * 3 + 2] += 0.03;

                    if (positions[i * 3 + 1] > 30) {
                        positions[i * 3 + 1] = -5;
                    }
                    if (positions[i * 3 + 2] > 20) {
                        positions[i * 3 + 2] = -120;
                        positions[i * 3] = (Math.random() - 0.5) * 120;
                    }
                }
            }
            this.particles.geometry.attributes.position.needsUpdate = true;
        }

        this.targetCameraX = this.mouseX * 3;
        this.targetCameraY = 4 + (this.mouseY * 1.5);

        this.camera.position.x += (this.targetCameraX - this.camera.position.x) * 0.05;
        this.camera.position.y += (this.targetCameraY - this.camera.position.y) * 0.05;
        
        this.camera.lookAt(0, -1, -5);

        this.renderer.render(this.scene, this.camera);
    }
}

// ==========================================
// 3. Database Manager & LocalStorage Sync
// ==========================================
class DatabaseManager {
    static init() {
        if (!localStorage.getItem('cicr_inventory')) {
            localStorage.setItem('cicr_inventory', JSON.stringify([]));
        }
        if (!localStorage.getItem('cicr_logs')) {
            localStorage.setItem('cicr_logs', JSON.stringify([]));
        }
        if (!localStorage.getItem('cicr_requests')) {
            localStorage.setItem('cicr_requests', JSON.stringify([]));
        }
        inventory = JSON.parse(localStorage.getItem('cicr_inventory')!);
        logs = JSON.parse(localStorage.getItem('cicr_logs')!);
        requests = JSON.parse(localStorage.getItem('cicr_requests')!);
    }

    static save() {
        localStorage.setItem('cicr_inventory', JSON.stringify(inventory));
        localStorage.setItem('cicr_logs', JSON.stringify(logs));
        localStorage.setItem('cicr_requests', JSON.stringify(requests));
    }

    static addLog(type: ActivityLog['type'], text: string) {
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        logs.unshift({ type, timestamp, text });
        this.save();
    }
}

// ==========================================
// 4. Dashboard Manager Class
// ==========================================
class DashboardManager {
    private activeCategory = 'all';
    private searchQuery = '';
    private listenersInitialized = false;
    private mobileSidebarOpen = false;

    private appContainer: HTMLElement;
    private inventoryGrid: HTMLElement;
    private noResults: HTMLElement;
    private searchInput: HTMLInputElement;
    private clearSearchBtn: HTMLElement;
    private resultsCount: HTMLElement;

    private statTotal: HTMLElement;
    private statBorrowed: HTMLElement;
    private statLow: HTMLElement;
    private statOut: HTMLElement;
    private mobileSidebarToggle: HTMLButtonElement | null;
    private mobileSidebarBackdrop: HTMLElement | null;

    private clockTimerId: any = null;

    constructor() {
        this.appContainer = document.getElementById('app-container')!;
        this.mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle') as HTMLButtonElement | null;
        this.mobileSidebarBackdrop = document.getElementById('mobile-sidebar-backdrop');
        this.inventoryGrid = document.getElementById('inventory-grid')!;
        this.noResults = document.getElementById('no-results')!;
        this.searchInput = document.getElementById('search-input') as HTMLInputElement;
        this.clearSearchBtn = document.getElementById('clear-search')!;
        this.resultsCount = document.getElementById('results-count')!;

        this.statTotal = document.getElementById('stat-total')!;
        this.statBorrowed = document.getElementById('stat-borrowed')!;
        this.statLow = document.getElementById('stat-low')!;
        this.statOut = document.getElementById('stat-out')!;

        this.init();
        this.loadInventory();
    }

    public init() {
        this.renderStats();
        this.renderInventory();
        if (!this.listenersInitialized) {
            this.setupEventListeners();
            this.listenersInitialized = true;
        }
    }

    private setMobileSidebar(open: boolean) {
        const shouldOpen = open && window.innerWidth <= 1100;
        this.mobileSidebarOpen = shouldOpen;
        this.appContainer.classList.toggle('sidebar-open', shouldOpen);
        this.mobileSidebarToggle?.setAttribute('aria-expanded', String(shouldOpen));
        if (this.mobileSidebarBackdrop) {
            this.mobileSidebarBackdrop.style.display = shouldOpen ? 'block' : 'none';
        }
    }

    private startClock() {
        if (this.clockTimerId) clearInterval(this.clockTimerId);

        const updateTime = () => {
            const now = new Date();
            
            // Format time: hh:mm:ss am/pm
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            const formattedHours = String(hours).padStart(2, '0');
            
            const clockEl = document.getElementById('dashboard-clock');
            if (clockEl) {
                clockEl.innerText = `${formattedHours}:${minutes}:${seconds} ${ampm}`;
            }

            // Format date: Tuesday, 17 March 2026
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const dayName = days[now.getDay()];
            const dateNum = now.getDate();
            const monthName = months[now.getMonth()];
            const year = now.getFullYear();

            const dateEl = document.getElementById('dashboard-date');
            if (dateEl) {
                dateEl.innerText = `${dayName}, ${dateNum} ${monthName} ${year}`;
            }

            // Update time-of-day greeting
            const curHour = now.getHours();
            let timeOfDay = 'evening';
            if (curHour < 12) {
                timeOfDay = 'morning';
            } else if (curHour < 17) {
                timeOfDay = 'afternoon';
            }
            
            const username = localStorage.getItem('cicr_auth') || 'Operator';
            const greetingEl = document.getElementById('dashboard-greeting');
            if (greetingEl) {
                greetingEl.innerText = `Good ${timeOfDay}, ${username}`;
            }
        };

        updateTime();
        this.clockTimerId = setInterval(updateTime, 1000);
    }

    private setupEventListeners() {
        // Ticking Clock and dynamic greeting initialization
        this.startClock();

        const closeMobileSidebar = () => this.setMobileSidebar(false);
        const toggleMobileSidebar = () => this.setMobileSidebar(!this.mobileSidebarOpen);

        this.mobileSidebarToggle?.addEventListener('click', () => {
            toggleMobileSidebar();
        });

        this.mobileSidebarBackdrop?.addEventListener('click', () => {
            closeMobileSidebar();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 1100) {
                closeMobileSidebar();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMobileSidebar();
            }
        });

        // 1. Sidebar Nav click listeners
        const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
        const sections = document.querySelectorAll('#app-main-content > section');
        const breadcrumbActive = document.getElementById('breadcrumb-current');

        const switchSection = (targetId: string) => {
            sections.forEach(node => {
                const sec = node as HTMLElement;
                if (sec.id === targetId) {
                    sec.classList.add('active');
                    sec.style.display = 'flex';
                    if (sec.id === 'inventory-view' || sec.id === 'projects-view' || sec.id === 'meetings-view' || sec.id === 'events-view') {
                        sec.style.display = 'block';
                    }
                } else {
                    sec.classList.remove('active');
                    sec.style.display = 'none';
                }
            });

            // Update sidebar link active class
            sidebarLinks.forEach(link => {
                const target = (link as HTMLElement).dataset.target;
                if (target === targetId) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            // Update breadcrumbs text
            if (breadcrumbActive) {
                const nameMap: Record<string, string> = {
                    'dashboard-view': 'DASHBOARD',
                    'projects-view': 'PROJECTS',
                    'meetings-view': 'MEETINGS',
                    'events-view': 'EVENTS',
                    'inventory-view': 'INVENTORY'
                };
                breadcrumbActive.innerText = nameMap[targetId] || 'WORKSPACE';
            }

            closeMobileSidebar();
        };

        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = (link as HTMLElement).dataset.target;
                if (target) {
                    switchSection(target);
                    closeMobileSidebar();
                }
            });
        });

        // 2. Dashboard action pills switching listeners
        const pillProjects = document.getElementById('dashboard-pill-projects');
        if (pillProjects) {
            pillProjects.addEventListener('click', () => switchSection('projects-view'));
        }
        const pillMeetings = document.getElementById('dashboard-pill-meetings');
        if (pillMeetings) {
            pillMeetings.addEventListener('click', () => switchSection('meetings-view'));
        }
        const pillEvents = document.getElementById('dashboard-pill-events');
        if (pillEvents) {
            pillEvents.addEventListener('click', () => switchSection('events-view'));
        }
        const pillAdmin = document.getElementById('dashboard-pill-admin');
        if (pillAdmin) {
            pillAdmin.addEventListener('click', () => {
                ModalManager.open('add-item-modal');
            });
        }
        const pillCommunity = document.getElementById('dashboard-pill-community');
        if (pillCommunity) {
            pillCommunity.addEventListener('click', () => {
                ModalManager.openAboutModal();
            });
        }

        // 3. Dashboard card switching listeners
        const cardVault = document.getElementById('dash-card-vault');
        if (cardVault) {
            cardVault.addEventListener('click', () => switchSection('inventory-view'));
        }
        const cardLogs = document.getElementById('dash-card-logs');
        if (cardLogs) {
            cardLogs.addEventListener('click', () => {
                ModalManager.openLogsDrawer();
            });
        }
        const cardProjects = document.getElementById('dash-card-projects');
        if (cardProjects) {
            cardProjects.addEventListener('click', () => switchSection('projects-view'));
        }
        const cardMeetings = document.getElementById('dash-card-meetings');
        if (cardMeetings) {
            cardMeetings.addEventListener('click', () => switchSection('meetings-view'));
        }
        const cardDiscussions = document.getElementById('dash-card-discussions');
        if (cardDiscussions) {
            cardDiscussions.addEventListener('click', () => {
                ModalManager.openAboutModal();
            });
        }
        const cardRecruitment = document.getElementById('dash-card-recruitment');
        if (cardRecruitment) {
            cardRecruitment.addEventListener('click', () => {
                ModalManager.openAboutModal();
            });
        }

        // 4. Notifications & History Drawer trigger
        const notifBtn = document.getElementById('sidebar-notifications-btn');
        if (notifBtn) {
            notifBtn.addEventListener('click', () => {
                ModalManager.openLogsDrawer();
            });
        }

        // 5. Command palette mock trigger
        const commandBtn = document.getElementById('sidebar-command-btn');
        if (commandBtn) {
            commandBtn.addEventListener('click', () => {
                const headerSearch = document.getElementById('header-search-input');
                if (headerSearch) {
                    headerSearch.focus();
                }
            });
        }

        // 6. Profile Logout button
        const logoutBtn = document.getElementById('sidebar-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // trigger logout directly on AuthManager
                const oldLogoutBtn = document.getElementById('nav-logout');
                if (oldLogoutBtn) {
                    oldLogoutBtn.click();
                } else {
                    localStorage.removeItem('cicr_auth');
                    window.location.reload();
                }
            });
        }

        // 7. Inventory Search Input listeners
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
            this.clearSearchBtn.style.display = this.searchQuery ? 'block' : 'none';
            this.renderInventory();
        });

        this.clearSearchBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.searchQuery = '';
            this.clearSearchBtn.style.display = 'none';
            this.renderInventory();
            this.searchInput.focus();
        });

        // 8. Sync active category states between sidebar items and tag pills
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        const tagPills = document.querySelectorAll('.tag-pill');

        const selectCategory = (category: string) => {
            this.activeCategory = category;
            
            sidebarItems.forEach(item => {
                const itemCat = (item as HTMLElement).dataset.category || 'all';
                if (itemCat === category) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            tagPills.forEach(pill => {
                const pillCat = (pill as HTMLElement).dataset.category || 'all';
                if (pillCat === category) {
                    pill.classList.add('active');
                } else {
                    pill.classList.remove('active');
                }
            });

            this.renderInventory();
        };

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const cat = (item as HTMLElement).dataset.category || 'all';
                selectCategory(cat);
                switchSection('inventory-view');
            });
        });

        tagPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const cat = (pill as HTMLElement).dataset.category || 'all';
                selectCategory(cat);
            });
        });

        // 9. Theme Switcher Buttons listeners
        const themeBtnDark = document.getElementById('theme-btn-dark');
        const themeBtnLight = document.getElementById('theme-btn-light');
        const themeBtnPink = document.getElementById('theme-btn-pink');
        const themeBtns = [themeBtnDark, themeBtnLight, themeBtnPink];

        const applyTheme = (themeName: 'dark' | 'light' | 'pink') => {
            document.body.classList.remove('theme-light', 'theme-pink');
            themeBtns.forEach(btn => btn?.classList.remove('active'));

            if (themeName === 'light') {
                document.body.classList.add('theme-light');
                themeBtnLight?.classList.add('active');
            } else if (themeName === 'pink') {
                document.body.classList.add('theme-pink');
                themeBtnPink?.classList.add('active');
            } else {
                themeBtnDark?.classList.add('active');
            }

            localStorage.setItem('cicr_theme', themeName);
        };

        themeBtnDark?.addEventListener('click', () => applyTheme('dark'));
        themeBtnLight?.addEventListener('click', () => applyTheme('light'));
        themeBtnPink?.addEventListener('click', () => applyTheme('pink'));

        // Load active theme state on dashboard init
        const activeTheme = (localStorage.getItem('cicr_theme') || 'dark') as 'dark' | 'light' | 'pink';
        applyTheme(activeTheme);
    }

    private renderStats() {
        let totalQty = 0;
        let checkedOutQty = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        inventory.forEach(item => {
            totalQty += item.quantity;

            const borrowedSum = (item.borrowedBy || []).reduce((sum, rec) => sum + rec.qty, 0);
            checkedOutQty += borrowedSum;

            const currentAvailable = item.quantity - borrowedSum;
            if (currentAvailable <= 0) {
                outOfStockCount++;
            } else if (currentAvailable <= 2) {
                lowStockCount++;
            }
        });

        this.statTotal.innerText = String(totalQty);
        this.statBorrowed.innerText = String(checkedOutQty);
        this.statLow.innerText = String(lowStockCount);
        this.statOut.innerText = String(outOfStockCount);
    }

    private renderInventory() {
        this.inventoryGrid.innerHTML = '';
        
        const filtered = inventory.filter(item => {
            const matchesCategory = this.activeCategory === 'all' || item.category === this.activeCategory;
            const matchesSearch = item.name.toLowerCase().includes(this.searchQuery) ||
                                  item.specs.toLowerCase().includes(this.searchQuery) ||
                                  item.location.toLowerCase().includes(this.searchQuery);
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            this.noResults.style.display = 'flex';
            this.resultsCount.innerText = "Showing 0 items";
            return;
        }

        this.noResults.style.display = 'none';
        this.resultsCount.innerText = `Showing ${filtered.length} component${filtered.length > 1 ? 's' : ''}`;

        filtered.forEach((item, index) => {
            const card = this.createCardElement(item);
            card.style.transitionDelay = `${(index % 4) * 0.08}s`;
            this.inventoryGrid.appendChild(card);
            
            requestAnimationFrame(() => {
                setTimeout(() => {
                    card.classList.add('active');
                }, 50);
            });
        });

        lucide.createIcons();
    }

    private async loadInventory() {
        try {
            const res = await fetch(`${API_BASE}/items`);
            const result = await res.json();

            inventory = (result.data || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                category: item.category || 'Electronics',
                quantity: item.quantity || 0,
                availableQuantity: item.available_quantity || item.quantity || 0,
                location: item.location || 'Lab',
                specs: item.description || 'No description available',
                image: item.image || '',
                status: item.status || 'AVAILABLE',
                tags: [],
                borrowedBy: []
            }));

            this.renderInventory();
            this.renderStats();
        }   catch (err) {
            console.error('Failed to load inventory', err);
        }
    }

    private createCardElement(item: InventoryItem): HTMLElement {
        const card = document.createElement('div');
        card.className = 'inventory-card glass reveal';
        
        const borrowedSum = (item.borrowedBy || []).reduce(
            (sum: number, rec: any) => sum + rec.qty,
            0
    );
        const available = item.quantity - borrowedSum;

        let statusText = 'Available';
        let statusClass = 'status-available';

        if (available === 0) {
            statusText = 'Out of Stock';
            statusClass = 'status-out';
        } else if (available <= 2) {
            statusText = 'Low Stock';
            statusClass = 'status-low';
        } else if (borrowedSum > 0) {
            statusText = 'Borrowed';
            statusClass = 'status-borrowed';
        }

        const catMap: Record<string, string> = {
            microcontrollers: "Controller",
            sensors: "Sensor",
            actuators: "Actuator",
            power: "Power Supply",
            tools: "Lab Tool"
        };
        const categoryLabel = catMap[item.category] || item.category;

        card.innerHTML = `
            <div class="card-header">
                <span class="card-category">${categoryLabel}</span>
                <span class="status-indicator ${statusClass}">${statusText}</span>
            </div>
            <h3 class="card-title">${item.name}</h3>
            <p class="card-desc">${item.specs}</p>
            <div class="card-footer">
                <div class="footer-info">
                    <span class="info-title">Location</span>
                    <span class="info-content"><i data-lucide="map-pin"></i> ${item.location}</span>
                </div>
                <div class="footer-info" style="align-items: flex-end;">
                    <span class="info-title">Availability</span>
                    <span class="info-content"><strong>${available}</strong> / ${item.quantity}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            ModalManager.openDetailModal(item);
        });

        return card;
    }
}



// ==========================================
// 5. Modal & Form Controller Manager
// ==========================================
class ModalManager {
    static init() {
        document.querySelectorAll('.close-modal, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target === el || el.classList.contains('close-modal')) {
                    this.closeAll();
                }
            });
        });

        document.querySelectorAll('.modal-content').forEach(content => {
            content.addEventListener('click', (e) => e.stopPropagation());
        });

        const addForm = document.getElementById('add-item-form') as HTMLFormElement;
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddItemSubmit();
        });

        document.getElementById('btn-add-cancel')!.addEventListener('click', () => {
            this.close('add-item-modal');
        });

        const borrowForm = document.getElementById('borrow-form') as HTMLFormElement;
        borrowForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBorrowSubmit();
        });

        document.querySelector('.btn-back-to-detail')!.addEventListener('click', () => {
            this.close('borrow-form-modal');
            this.open('detail-modal');
        });

        document.getElementById('btn-borrow')!.addEventListener('click', () => {
            this.openBorrowFormModal();
        });

        document.querySelector('.btn-close-about')!.addEventListener('click', () => {
            this.close('about-modal');
        });
    }

    static open(modalId: string) {
        document.getElementById(modalId)!.classList.add('active');
    }

    static close(modalId: string) {
        document.getElementById(modalId)!.classList.remove('active');
    }

    static closeAll() {
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.classList.remove('active');
        });
        selectedItem = null;
    }

    private static getCurrentRole(): UserRole {
        const storedRole = localStorage.getItem('cicr_role');
        if (storedRole === 'ADMIN' || storedRole === 'MEMBER') {
            return storedRole;
        }

        return 'MEMBER';
    }

    private static isAdmin() {
        return this.getCurrentRole() === 'ADMIN';
    }

    private static setBorrowModalMode(mode: 'borrow' | 'request', componentName: string, available: number) {
        const modalTitle = document.getElementById('borrow-form-title');
        const subtitle = document.getElementById('borrow-form-subtitle');
        const submitBtn = document.getElementById('borrow-form-submit') as HTMLButtonElement | null;
        const qtyLimit = document.getElementById('borrow-qty-limit');

        if (modalTitle) {
            modalTitle.innerText = mode === 'borrow' ? 'Borrow Component' : 'Request Component';
        }
        if (subtitle) {
            subtitle.innerText = `${mode === 'borrow' ? 'Borrowing' : 'Requesting'} ${componentName}`;
        }
        if (submitBtn) {
            submitBtn.innerText = mode === 'borrow' ? 'Confirm Borrow' : 'Send Request';
        }
        if (qtyLimit) {
            qtyLimit.innerText = `Max units available: ${available}`;
        }
    }

    private static renderRequests() {
        const requestInbox = document.getElementById('request-inbox') as HTMLElement | null;
        const requestList = document.getElementById('request-list');
        const requestCountBadge = document.getElementById('request-count-badge');

        if (!requestInbox || !requestList || !requestCountBadge) return;

        if (!this.isAdmin()) {
            requestInbox.style.display = 'none';
            requestCountBadge.innerText = '0';
            return;
        }

        requestInbox.style.display = 'flex';
        const pendingRequests = requests.filter((request) => request.status === 'PENDING');
        requestCountBadge.innerText = String(pendingRequests.length);
        requestList.innerHTML = '';

        if (pendingRequests.length === 0) {
            requestList.innerHTML = '<div class="request-empty-state">No pending member requests right now.</div>';
            return;
        }

        pendingRequests.forEach((request) => {
            const requestEl = document.createElement('div');
            requestEl.className = 'request-item';
            requestEl.innerHTML = `
                <div class="request-item-header">
                    <div>
                        <h4 class="request-item-title">${request.itemName}</h4>
                        <div class="request-item-meta">
                            <span>${request.name}</span>
                            <span>${request.roll}</span>
                            <span>${request.qty} units</span>
                        </div>
                    </div>
                    <span class="request-status-chip request-status-pending">${request.status}</span>
                </div>
                <div class="request-item-meta">
                    <span>Purpose: ${request.purpose}</span>
                    <span>Requested: ${request.requestedAt}</span>
                </div>
                <div class="request-item-actions">
                    <button class="btn btn-primary request-approve-btn" data-request-id="${request.id}">
                        <i data-lucide="check"></i> Approve
                    </button>
                    <button class="btn btn-secondary request-reject-btn" data-request-id="${request.id}">
                        <i data-lucide="x"></i> Reject
                    </button>
                </div>
            `;

            requestList.appendChild(requestEl);
        });

        requestList.querySelectorAll('.request-approve-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const requestId = (button as HTMLButtonElement).dataset.requestId;
                if (requestId) {
                    this.reviewRequest(requestId, 'APPROVED');
                }
            });
        });

        requestList.querySelectorAll('.request-reject-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const requestId = (button as HTMLButtonElement).dataset.requestId;
                if (requestId) {
                    this.reviewRequest(requestId, 'REJECTED');
                }
            });
        });
    }

    private static reviewRequest(requestId: string, nextStatus: 'APPROVED' | 'REJECTED') {
        if (!this.isAdmin()) return;

        const request = requests.find((entry) => entry.id === requestId);
        if (!request || request.status !== 'PENDING') return;

        if (nextStatus === 'APPROVED') {
            const item = inventory.find((entry) => entry.id === request.itemId);
            const borrowedSum = item ? item.borrowedBy.reduce((sum, rec) => sum + rec.qty, 0) : 0;
            const available = item ? item.quantity - borrowedSum : 0;

            if (!item || available < request.qty) {
                request.status = 'REJECTED';
                request.reviewedAt = new Date().toISOString();
                request.reviewedBy = localStorage.getItem('cicr_auth') || 'ADMIN';
                request.reviewNote = 'Auto-rejected because stock was no longer available.';
                DatabaseManager.addLog('reject', `<span>${request.name}</span>'s request for <span>${request.itemName}</span> was rejected because stock ran out.`);
                DatabaseManager.save();
                this.renderRequests();
                if (selectedItem && selectedItem.id === request.itemId) {
                    this.openDetailModal(selectedItem);
                }
                window.dashboard?.init();
                return;
            }

            const defaultDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            item.borrowedBy.push({
                name: request.name,
                roll: request.roll,
                qty: request.qty,
                purpose: request.purpose,
                date: new Date().toISOString().split('T')[0],
                dueDate: request.dueDate || defaultDueDate
            });

            DatabaseManager.addLog('approve', `<span>${request.name}</span>'s request for <span>${request.itemName}</span> was approved by admin.`);
            request.status = 'APPROVED';
        } else {
            DatabaseManager.addLog('reject', `<span>${request.name}</span>'s request for <span>${request.itemName}</span> was rejected by admin.`);
            request.status = 'REJECTED';
        }

        request.reviewedAt = new Date().toISOString();
        request.reviewedBy = localStorage.getItem('cicr_auth') || 'ADMIN';
        DatabaseManager.save();
        this.renderRequests();
        if (selectedItem && selectedItem.id === request.itemId) {
            this.openDetailModal(selectedItem);
        }
        window.dashboard?.init();
        lucide.createIcons();
    }

    static openAboutModal() {
        this.open('about-modal');
    }

    static openDetailModal(item: InventoryItem) {
        selectedItem = item;
        
        const borrowedSum = item.borrowedBy.reduce((sum, rec) => sum + rec.qty, 0);
        const available = item.quantity - borrowedSum;

        document.getElementById('detail-name')!.innerText = item.name;
        document.getElementById('detail-location')!.innerText = item.location;
        document.getElementById('detail-specs')!.innerText = item.specs;
        document.getElementById('detail-quantity')!.innerHTML = `<strong>${available}</strong> / ${item.quantity} available`;
        
        const catMap: Record<string, string> = {
            microcontrollers: "Microcontroller / Development Board",
            sensors: "Sensor & Module",
            actuators: "Actuator & Driver",
            power: "Power & Battery Storage",
            tools: "Lab Equipment / Tool"
        };
        document.getElementById('detail-category')!.innerText = catMap[item.category] || item.category;

        const badge = document.getElementById('detail-status')!;
        badge.className = 'modal-status-badge'; 
        
        const borrowBtn = document.getElementById('btn-borrow') as HTMLButtonElement;
        const returnBtn = document.getElementById('btn-return') as HTMLButtonElement;
        const role = this.getCurrentRole();

        if (available === 0) {
            badge.innerText = 'Out of Stock';
            badge.classList.add('status-out');
            borrowBtn.disabled = true;
            borrowBtn.style.opacity = '0.5';
        } else if (available <= 2) {
            badge.innerText = 'Low Stock';
            badge.classList.add('status-low');
            borrowBtn.disabled = false;
            borrowBtn.style.opacity = '1';
        } else {
            badge.innerText = 'Available';
            badge.classList.add('status-available');
            borrowBtn.disabled = false;
            borrowBtn.style.opacity = '1';
        }

        if (role === 'ADMIN' && item.borrowedBy.length > 0) {
            returnBtn.style.display = 'inline-flex';
        } else {
            returnBtn.style.display = 'none';
        }

        if (role === 'ADMIN') {
            borrowBtn.innerHTML = '<i data-lucide="shopping-cart"></i> Checkout / Borrow';
        } else {
            borrowBtn.innerHTML = '<i data-lucide="send"></i> Request Issue';
        }

        const borrowersPanel = document.getElementById('borrowers-panel')!;
        const listContainer = document.getElementById('borrowers-list')!;
        listContainer.innerHTML = '';

        if (item.borrowedBy.length > 0) {
            borrowersPanel.style.display = 'block';
            const todayStr = new Date().toISOString().split('T')[0];

            item.borrowedBy.forEach((rec, idx) => {
                let due = rec.dueDate;
                if (!due && rec.date) {
                    const bTime = new Date(rec.date).getTime();
                    if (!isNaN(bTime)) {
                        due = new Date(bTime + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    }
                }
                const isOverdue = Boolean(due && due < todayStr);
                const dueBadge = due ? `<span class="borrower-due-badge ${isOverdue ? 'overdue' : ''}">${isOverdue ? 'OVERDUE: ' : 'Due: '}${due}</span>` : '';

                const recEl = document.createElement('div');
                recEl.className = 'borrower-record';
                recEl.innerHTML = `
                    <div class="borrower-info-main">
                        <span class="borrower-name">${rec.name}</span>
                        <span class="borrower-roll">${rec.roll} &bull; ${rec.purpose}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${dueBadge}
                        <span class="borrower-qty-badge">${rec.qty} units</span>
                        <button class="btn btn-secondary btn-inline-return" style="padding: 6px 10px; font-size: 11px;" data-index="${idx}">
                            <i data-lucide="corner-up-left" style="width:12px;height:12px;"></i> Return
                        </button>
                    </div>
                `;
                
                recEl.querySelector('.btn-inline-return')!.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleReturnClick(idx);
                });
                
                listContainer.appendChild(recEl);
            });
        } else {
            borrowersPanel.style.display = 'none';
        }

        this.open('detail-modal');
        lucide.createIcons();
    }

    static openBorrowFormModal() {
        if (!selectedItem) return;
        
        const borrowedSum = selectedItem.borrowedBy.reduce((sum, rec) => sum + rec.qty, 0);
        const available = selectedItem.quantity - borrowedSum;

        this.setBorrowModalMode(this.isAdmin() ? 'borrow' : 'request', selectedItem.name, available);

        const qtyInput = document.getElementById('borrow-qty') as HTMLInputElement;
        qtyInput.max = String(available);
        qtyInput.value = '1';

        const dueDateInput = document.getElementById('borrow-due-date') as HTMLInputElement | null;
        if (dueDateInput) {
            const today = new Date().toISOString().split('T')[0];
            const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            dueDateInput.min = today;
            dueDateInput.value = defaultDue;
        }

        this.close('detail-modal');
        this.open('borrow-form-modal');
    }

    static openLogsDrawer() {
        this.renderRequests();

        const logsList = document.getElementById('logs-list')!;
        logsList.innerHTML = '';

        // 1. Scan for active unreturned loans that have passed their due date (OVERDUE - Red)
        const todayStr = new Date().toISOString().split('T')[0];
        const activeOverdueList: { item: InventoryItem; rec: BorrowRecord; due: string }[] = [];

        inventory.forEach((item) => {
            (item.borrowedBy || []).forEach((rec) => {
                if (rec.returned) return;

                let due = rec.dueDate;
                if (!due && rec.date) {
                    const bTime = new Date(rec.date).getTime();
                    if (!isNaN(bTime)) {
                        due = new Date(bTime + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    }
                }

                if (due && due < todayStr) {
                    activeOverdueList.push({ item, rec, due });
                }
            });
        });

        const hasOverdue = activeOverdueList.length > 0;
        const hasLogs = logs.length > 0;

        if (!hasOverdue && !hasLogs) {
            logsList.innerHTML = '<div class="request-empty-state">No logs logged.</div>';
        } else {
            // Render active Overdue alerts first (Red status, only when an active borrowed item has passed its due date)
            activeOverdueList.forEach(({ item, rec, due }) => {
                const logEl = document.createElement('div');
                logEl.className = 'log-item log-action-overdue';
                logEl.innerHTML = `
                    <div class="log-meta">
                        <span class="log-type-tag"><i data-lucide="clock-alert"></i> OVERDUE</span>
                        <span>Due: ${due}</span>
                    </div>
                    <div class="log-text-content"><span>${rec.name}</span> (${rec.roll}) has not returned <span>${rec.qty}x ${item.name}</span>. Loan was due on <span>${due}</span>.</div>
                `;
                logsList.appendChild(logEl);
            });

            // Render all historical transaction logs with their corresponding status colors
            logs.forEach(log => {
                const logEl = document.createElement('div');
                logEl.className = `log-item log-action-${log.type}`;
                
                let icon = 'info';
                let label = log.type.toUpperCase();

                if (log.type === 'borrow') {
                    icon = 'shopping-cart';
                    label = 'BORROW';
                } else if (log.type === 'return') {
                    icon = 'corner-up-left';
                    label = 'RETURNED';
                } else if (log.type === 'overdue') {
                    icon = 'clock-alert';
                    label = 'OVERDUE';
                } else if (log.type === 'low_stock') {
                    icon = 'alert-circle';
                    label = 'LOW STOCK';
                } else if (log.type === 'add') {
                    icon = 'plus';
                    label = 'NEW COMPONENT';
                } else if (log.type === 'system') {
                    icon = 'info';
                    label = 'SYSTEM';
                } else if (log.type === 'request') {
                    icon = 'send';
                    label = 'REQUEST';
                } else if (log.type === 'approve') {
                    icon = 'check';
                    label = 'APPROVED';
                } else if (log.type === 'reject') {
                    icon = 'x';
                    label = 'REJECTED';
                }

                logEl.innerHTML = `
                    <div class="log-meta">
                        <span class="log-type-tag"><i data-lucide="${icon}"></i> ${label}</span>
                        <span>${log.timestamp}</span>
                    </div>
                    <div class="log-text-content">${log.text}</div>
                `;
                logsList.appendChild(logEl);
            });
        }

        this.open('logs-drawer');
        lucide.createIcons();
    }

    private static handleAddItemSubmit() {
        const name = (document.getElementById('item-name') as HTMLInputElement).value.trim();
        const category = (document.getElementById('item-category') as HTMLSelectElement).value;
        const qty = parseInt((document.getElementById('item-qty') as HTMLInputElement).value);
        const location = (document.getElementById('item-location') as HTMLInputElement).value.trim();
        const specs = (document.getElementById('item-specs') as HTMLTextAreaElement).value.trim() || "No specifications provided.";

        if (!name || !category || isNaN(qty) || !location) return;

        const id = `${category.slice(0, 2)}-${Date.now().toString().slice(-4)}`;

        const newItem: InventoryItem = {
            id,
            name,
            category,
            quantity: qty,
            location,
            specs,
            borrowedBy: []
        };

        inventory.unshift(newItem);
        DatabaseManager.addLog('add', `Registered new component <span>${name}</span> (Qty: ${qty}) at <span>${location}</span>.`);
        
        (document.getElementById('add-item-form') as HTMLFormElement).reset();
        
        this.close('add-item-modal');
        window.dashboard!.init();
    }

    private static handleBorrowSubmit() {
        if (!selectedItem) return;

        const borrowerName = (document.getElementById('borrow-name') as HTMLInputElement).value.trim();
        const rollNum = (document.getElementById('borrow-roll') as HTMLInputElement).value.trim();
        const qty = parseInt((document.getElementById('borrow-qty') as HTMLInputElement).value);
        const purpose = (document.getElementById('borrow-purpose') as HTMLInputElement).value.trim();

        const borrowedSum = selectedItem.borrowedBy.reduce((sum, rec) => sum + rec.qty, 0);
        const available = selectedItem.quantity - borrowedSum;

        if (qty > available || qty <= 0 || isNaN(qty) || !borrowerName || !rollNum || !purpose) {
            alert("Please enter a valid borrow quantity within limits.");
            return;
        }

        const requestMode = !this.isAdmin();

        const dueDateInput = document.getElementById('borrow-due-date') as HTMLInputElement | null;
        const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const dueDate = (dueDateInput && dueDateInput.value) ? dueDateInput.value : defaultDue;

        if (requestMode) {
            const request: RequestRecord = {
                id: `req-${Date.now()}`,
                itemId: selectedItem.id,
                itemName: selectedItem.name,
                name: borrowerName,
                roll: rollNum,
                qty,
                purpose,
                dueDate,
                status: 'PENDING',
                requestedAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
            };

            requests.unshift(request);
            DatabaseManager.addLog('request', `<span>${borrowerName}</span> requested ${qty}x <span>${selectedItem.name}</span> for '${purpose}'.`);
        } else {
            const date = new Date().toISOString().split('T')[0];

            selectedItem.borrowedBy.push({
                name: borrowerName,
                roll: rollNum,
                qty: qty,
                purpose: purpose,
                date: date,
                dueDate: dueDate
            });

            DatabaseManager.addLog('borrow', `<span>${borrowerName}</span> checked out ${qty}x <span>${selectedItem.name}</span> (Due: ${dueDate}) for '${purpose}'.`);
        }

        (document.getElementById('borrow-form') as HTMLFormElement).reset();
        DatabaseManager.save();
        this.close('borrow-form-modal');
        if (requestMode) {
            this.openLogsDrawer();
        }
        window.dashboard!.init();
    }

    private static handleReturnClick(idx: number) {
        if (!selectedItem) return;

        const rec = selectedItem.borrowedBy[idx];
        if (!rec) return;

        selectedItem.borrowedBy.splice(idx, 1);
        DatabaseManager.addLog('return', `<span>${rec.name}</span> returned ${rec.qty}x <span>${selectedItem.name}</span>.`);

        DatabaseManager.save();
        this.openDetailModal(selectedItem);
        window.dashboard!.init();
    }
}

// ==========================================
// 6. User Authentication Manager
// ==========================================
class AuthManager {
    private static loginForm: HTMLFormElement;
    private static signupForm: HTMLFormElement;
    private static authOverlay: HTMLElement;
    private static appContainer: HTMLElement;
    private static globalNavbar: HTMLElement;

    private static loginUserInp: HTMLInputElement;
    private static loginPassInp: HTMLInputElement;
    private static loginErr: HTMLElement;

    private static signupUserInp: HTMLInputElement;
    private static signupEmailInp: HTMLInputElement;
    private static signupPassInp: HTMLInputElement;
    private static signupErr: HTMLElement;
    private static signupSuccess: HTMLElement;

    private static navUsername: HTMLElement;
    private static navLogoutBtn: HTMLElement;

    static init() {
        if (!localStorage.getItem('cicr_users')) {
            localStorage.setItem('cicr_users', JSON.stringify({}));
        }

        this.loginForm = document.getElementById('login-form') as HTMLFormElement;
        this.signupForm = document.getElementById('signup-form') as HTMLFormElement;
        this.authOverlay = document.getElementById('auth-overlay')!;
        this.appContainer = document.getElementById('app-container')!;
        this.globalNavbar = document.getElementById('global-navbar')!;

        this.loginUserInp = document.getElementById('login-username') as HTMLInputElement;
        this.loginPassInp = document.getElementById('login-password') as HTMLInputElement;
        this.loginErr = document.getElementById('login-error')!;

        this.signupUserInp = document.getElementById('signup-username') as HTMLInputElement;
        this.signupEmailInp = document.getElementById('signup-email') as HTMLInputElement;
        this.signupPassInp = document.getElementById('signup-password') as HTMLInputElement;
        this.signupErr = document.getElementById('signup-error')!;
        this.signupSuccess = document.getElementById('signup-success')!;

        this.navUsername = document.getElementById('nav-username')!;
        this.navLogoutBtn = document.getElementById('nav-logout')!;

        this.setupEventListeners();
        this.checkAuth();
    }

    private static setupEventListeners() {
        document.getElementById('go-to-signup')!.addEventListener('click', (e) => {
            e.preventDefault();
            this.loginForm.style.display = 'none';
            this.signupForm.style.display = 'block';
            this.loginErr.style.display = 'none';
            this.signupForm.reset();
        });

        document.getElementById('go-to-login')!.addEventListener('click', (e) => {
            e.preventDefault();
            this.signupForm.style.display = 'none';
            this.loginForm.style.display = 'block';
            this.signupErr.style.display = 'none';
            this.signupSuccess.style.display = 'none';
            this.loginForm.reset();
        });

        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        this.signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSignup();
        });

        this.navLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        // Password visibility toggles
        const loginToggle = document.getElementById('login-password-toggle')!;
        const loginPass = document.getElementById('login-password') as HTMLInputElement;
        loginToggle.addEventListener('click', () => {
            const currentType = loginPass.getAttribute('type');
            const newType = currentType === 'password' ? 'text' : 'password';
            loginPass.setAttribute('type', newType);
            
            const icon = loginToggle.querySelector('i')!;
            icon.setAttribute('data-lucide', newType === 'password' ? 'eye' : 'eye-off');
            lucide.createIcons();
        });

        const signupToggle = document.getElementById('signup-password-toggle')!;
        const signupPass = document.getElementById('signup-password') as HTMLInputElement;
        signupToggle.addEventListener('click', () => {
            const currentType = signupPass.getAttribute('type');
            const newType = currentType === 'password' ? 'text' : 'password';
            signupPass.setAttribute('type', newType);
            
            const icon = signupToggle.querySelector('i')!;
            icon.setAttribute('data-lucide', newType === 'password' ? 'eye' : 'eye-off');
            lucide.createIcons();
        });
    }

    private static checkAuth() {
        const currentUser = localStorage.getItem('cicr_auth');
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        
        if (currentUser) {
            this.loginSuccess(currentUser);
        } else {
            this.globalNavbar.style.display = 'none';
            this.authOverlay.classList.remove('hidden');
            this.authOverlay.style.display = 'flex';
            this.appContainer.style.display = 'none';
        }
    }

    private static handleLogin() {
        const username = this.loginUserInp.value.trim();
        const password = this.loginPassInp.value;

        this.loginErr.style.display = 'none';

        const users = JSON.parse(localStorage.getItem('cicr_users')!) as UserDatabase;
        if (users[username] && users[username] === password) {
            this.loginSuccess(username);
            return;
        }

        this.loginErr.innerText = "Access Denied: Invalid credentials.";
        this.loginErr.style.display = 'block';
        this.loginErr.style.animation = 'none';
        this.loginErr.offsetHeight; 
        this.loginErr.style.animation = 'shake-error 0.4s ease';
    }

    private static loginSuccess(username: string) {
        localStorage.setItem('cicr_auth', username);
        if (this.navUsername) {
            this.navUsername.innerText = username;
        }

        // Set username and initial in the left sidebar profile card
        const profileUserDisplay = document.getElementById('profile-username-display');
        const profileAvatarInitial = document.getElementById('profile-avatar-initial');
        if (profileUserDisplay) profileUserDisplay.innerText = username;
        if (profileAvatarInitial) profileAvatarInitial.innerText = username.charAt(0).toUpperCase();

        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        // Directly transition: hide auth form, show app container
        this.authOverlay.style.display = 'none';
        this.appContainer.style.display = 'grid';

        // Select Dashboard link in the left sidebar by default
        const activeNavClass = () => {
            const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
            sidebarLinks.forEach(link => {
                const target = (link as HTMLElement).dataset.target;
                if (target === 'dashboard-view') {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
            const sections = document.querySelectorAll('#app-main-content > section');
            sections.forEach(node => {
                const sec = node as HTMLElement;
                if (sec.id === 'dashboard-view') {
                    sec.classList.add('active');
                    sec.style.display = 'flex';
                } else {
                    sec.classList.remove('active');
                    sec.style.display = 'none';
                }
            });
            const breadcrumbActive = document.getElementById('breadcrumb-current');
            if (breadcrumbActive) breadcrumbActive.innerText = 'DASHBOARD';
        };
        activeNavClass();

        if (!window.dashboard) {
            window.dashboard = new DashboardManager();
        } else {
            window.dashboard.init();
        }
        lucide.createIcons();
        TerminalSimulator.start();
    }

    private static handleSignup() {
        const username = this.signupUserInp.value.trim();
        const email = this.signupEmailInp.value.trim();
        const password = this.signupPassInp.value;

        this.signupErr.style.display = 'none';
        this.signupSuccess.style.display = 'none';

        if (username.length < 3) {
            this.showSignupError("Username must be at least 3 characters.");
            return;
        }

        const users = JSON.parse(localStorage.getItem('cicr_users')!) as UserDatabase;
        if (users[username]) {
            this.showSignupError("Username already registered.");
            return;
        }

        users[username] = password;
        localStorage.setItem('cicr_users', JSON.stringify(users));

        DatabaseManager.addLog('system', `New operator registered: <span>${username}</span> (${email}).`);

        this.signupSuccess.innerText = "Registration complete! Switching to Login...";
        this.signupSuccess.style.display = 'block';

        setTimeout(() => {
            document.getElementById('go-to-login')!.click();
        }, 1500);
    }

    private static showSignupError(msg: string) {
        this.signupErr.innerText = msg;
        this.signupErr.style.display = 'block';
        this.signupErr.style.animation = 'none';
        this.signupErr.offsetHeight;
        this.signupErr.style.animation = 'shake-error 0.4s ease';
    }

    private static handleLogout() {
        localStorage.removeItem('cicr_auth');
        
        this.appContainer.style.display = 'none';
        this.globalNavbar.style.display = 'none';
        
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            welcomeScreen.style.transform = 'translateY(0)';
        }

        this.authOverlay.style.display = 'flex';
        setTimeout(() => {
            this.authOverlay.classList.remove('hidden');
        }, 50);

        this.loginForm.reset();
        this.loginErr.style.display = 'none';
    }
}

// ==========================================
// Terminal Simulator Logic
// ==========================================
class TerminalSimulator {
    static start() {
        const body = document.getElementById('terminal-log-body');
        if (!body) return;
        body.innerHTML = '';

        const lines = [
            { text: "Initializing CICR Core OS v3.5...", color: "#f3f4f6" },
            { text: "Establishing telemetry link to local JIIT-128 robotics vault...", color: "#f3f4f6" },
            { text: "Robotics telemetry buffers initialized successfully [OK]", color: "#39ff14" },
            { text: "Connecting to Qdrant vector database: Index hardware_kb loaded", color: "#00f0ff" },
            { text: "Seeding RAG knowledge base (STM32 manuals + pinouts)...", color: "#f3f4f6" },
            { text: "LangGraph workflow network compiled: 8 agent nodes ready", color: "#f3f4f6" },
            { text: "Vision Node: YOLOv11 component classification weights checked", color: "#ff007a" },
            { text: "Vision Node: SAM2 segmented coordinate maps ready", color: "#bd00ff" },
            { text: "MCP Server: Exposing tools: checkout_item, query_stock", color: "#ffd700" }
        ];

        let lineIdx = 0;
        
        function appendNextLine() {
            if (lineIdx >= lines.length) return;

            const line = lines[lineIdx];
            const lineEl = document.createElement('div');
            lineEl.className = 'terminal-line';
            body!.appendChild(lineEl);
            body!.scrollTop = body!.scrollHeight;

            let charIdx = 0;
            lineEl.innerHTML = `<span style="color: ${line.color}">&rarr;&nbsp;&rarr;&nbsp;</span><span class="txt-content" style="color: ${line.color}"></span>`;
            const txtSpan = lineEl.querySelector('.txt-content') as HTMLElement;
            
            lineEl.classList.add('visible');

            const cursorSpan = document.createElement('span');
            cursorSpan.className = 'cursor';
            lineEl.appendChild(cursorSpan);

            function typeChar() {
                if (charIdx < line.text.length) {
                    txtSpan.textContent += line.text[charIdx];
                    charIdx++;
                    setTimeout(typeChar, 25);
                } else {
                    cursorSpan.remove();
                    
                    if (lineIdx === lines.length - 1) {
                        const finalCursor = document.createElement('span');
                        finalCursor.className = 'cursor';
                        lineEl.appendChild(finalCursor);
                        
                        // Always keep typing: clear terminal logs and restart after 4 seconds!
                        setTimeout(() => {
                            body!.innerHTML = '';
                            lineIdx = 0;
                            appendNextLine();
                        }, 4000);
                    } else {
                        lineIdx++;
                        setTimeout(appendNextLine, 350);
                    }
                }
            }
            typeChar();
        }

        appendNextLine();
    }
}



// ==========================================
// Cherry Blossom (Sakura) Falling Leaves Engine
// ==========================================
interface SakuraPetal {
    x: number;
    y: number;
    size: number;
    speedY: number;
    swayFreq: number;
    swayAmp: number;
    swayPhase: number;
    rotation: number;
    rotationSpeed: number;
    flipAngle: number;
    flipSpeed: number;
    opacity: number;
    colorStart: string;
    colorEnd: string;
}

class SakuraAnimation {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private petals: SakuraPetal[] = [];
    private animationFrameId: number | null = null;
    private isRunning = false;
    private width = window.innerWidth;
    private height = window.innerHeight;

    private colors = [
        { start: '#ffd1e8', end: '#ec4899' },
        { start: '#fce7f3', end: '#f43f5e' },
        { start: '#fbcfe8', end: '#fda4af' },
        { start: '#f472b6', end: '#db2777' },
    ];

    constructor() {
        this.canvas = document.getElementById('sakura-canvas') as HTMLCanvasElement;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.initPetals(75);
        this.setupEvents();
    }

    private resize() {
        if (!this.canvas) return;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    private initPetals(count: number) {
        this.petals = [];
        for (let i = 0; i < count; i++) {
            this.petals.push(this.createPetal(true));
        }
    }

    private createPetal(randomY = false): SakuraPetal {
        const colorPair = this.colors[Math.floor(Math.random() * this.colors.length)];
        return {
            x: Math.random() * this.width,
            y: randomY ? Math.random() * this.height : -20 - Math.random() * 40,
            size: Math.random() * 9 + 8,
            speedY: Math.random() * 1.2 + 0.8,
            swayFreq: Math.random() * 0.02 + 0.01,
            swayAmp: Math.random() * 2.5 + 1.2,
            swayPhase: Math.random() * Math.PI * 2,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.03,
            flipAngle: Math.random() * Math.PI,
            flipSpeed: Math.random() * 0.03 + 0.01,
            opacity: Math.random() * 0.35 + 0.6,
            colorStart: colorPair.start,
            colorEnd: colorPair.end,
        };
    }

    private setupEvents() {
        window.addEventListener('resize', () => this.resize());
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.loop();
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private drawPetal(petal: SakuraPetal) {
        if (!this.ctx) return;
        const { x, y, size, rotation, flipAngle, opacity, colorStart, colorEnd } = petal;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(rotation);

        const scaleX = Math.cos(flipAngle);
        this.ctx.scale(scaleX, 1);

        this.ctx.globalAlpha = opacity;

        const grad = this.ctx.createLinearGradient(0, -size, 0, size);
        grad.addColorStop(0, colorStart);
        grad.addColorStop(1, colorEnd);
        this.ctx.fillStyle = grad;

        this.ctx.beginPath();
        this.ctx.moveTo(0, -size);
        this.ctx.bezierCurveTo(size * 0.75, -size * 0.75, size * 0.9, size * 0.4, 0, size);
        this.ctx.bezierCurveTo(-size * 0.9, size * 0.4, -size * 0.75, -size * 0.75, 0, -size);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(236, 72, 153, 0.25)';
        this.ctx.lineWidth = 0.8;
        this.ctx.stroke();

        this.ctx.restore();
    }

    private loop() {
        if (!this.isRunning || !this.ctx || !this.canvas) return;

        this.ctx.clearRect(0, 0, this.width, this.height);

        for (let i = 0; i < this.petals.length; i++) {
            const p = this.petals[i];

            p.y += p.speedY;
            p.swayPhase += p.swayFreq;
            p.x += Math.sin(p.swayPhase) * p.swayAmp;
            p.rotation += p.rotationSpeed;
            p.flipAngle += p.flipSpeed;

            if (p.y > this.height + 30 || p.x < -40 || p.x > this.width + 40) {
                this.petals[i] = this.createPetal(false);
            }

            this.drawPetal(p);
        }

        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
}

// ==========================================
// Avengers Cinematic Ambient Engine (Shield + Arc Reactor HUD)
// ==========================================
class AvengersAnimation {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private animationFrameId: number | null = null;
    private isRunning = false;
    private pulseTime = 0;

    constructor() {
        this.canvas = document.getElementById('avengers-canvas') as HTMLCanvasElement;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.resize();
        this.loop();
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string, strokeColor?: string, strokeWidth: number = 2) {
        let rot = (Math.PI / 2) * 3;
        let step = Math.PI / spikes;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            let x = cx + Math.cos(rot) * outerRadius;
            let y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            ctx.stroke();
        }
    }

    private drawBackground() {
        if (!this.ctx || !this.canvas) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const baseRadius = Math.min(w, h) * 0.27;
        const pulse = Math.sin(this.pulseTime) * 0.02;
        // Light, subtle, translucent background opacity so content and texts shine through clearly
        const opacity = 0.16 + pulse;

        this.ctx.save();
        this.ctx.globalAlpha = opacity;

        // 1. Soft Vibranium / Stark Arc Energy Aura Glow (light & subtle)
        const bgGlow = this.ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 1.35);
        bgGlow.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
        bgGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)');
        bgGlow.addColorStop(0.85, 'rgba(0, 240, 255, 0.05)');
        bgGlow.addColorStop(1, 'transparent');
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 1.35, 0, Math.PI * 2);
        this.ctx.fillStyle = bgGlow;
        this.ctx.fill();

        // 2. Light Arc Cyan & Stark Gold Outer Tech Halo Rings
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 1.22, 0, Math.PI * 2);
        this.ctx.lineWidth = Math.max(1.5, baseRadius * 0.015);
        this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 1.12, 0, Math.PI * 2);
        this.ctx.lineWidth = Math.max(2, baseRadius * 0.02);
        this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        this.ctx.shadowColor = '#00f0ff';
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        // 12 Stark HUD Nodes
        const nodes = 12;
        for (let i = 0; i < nodes; i++) {
            const angle = (i * Math.PI * 2) / nodes + this.pulseTime * 0.12;
            const nx = cx + Math.cos(angle) * (baseRadius * 1.12);
            const ny = cy + Math.sin(angle) * (baseRadius * 1.12);
            this.ctx.beginPath();
            this.ctx.arc(nx, ny, Math.max(2, baseRadius * 0.018), 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.fill();
        }

        // 3. CAPTAIN AMERICA SHIELD WITH DISTINCT BLACK BOUNDARIES
        // Outer Red Vibranium Ring
        const redGrad1 = this.ctx.createRadialGradient(cx, cy, baseRadius * 0.74, cx, cy, baseRadius);
        redGrad1.addColorStop(0, '#f87171');
        redGrad1.addColorStop(0.6, '#ef4444');
        redGrad1.addColorStop(1, '#b91c1c');
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = redGrad1;
        this.ctx.fill();

        // Bold Outer Black Boundary of the Shield
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        this.ctx.lineWidth = Math.max(4, baseRadius * 0.032);
        this.ctx.strokeStyle = '#000000';
        this.ctx.stroke();

        // Middle Silver White Ring
        const silverGrad = this.ctx.createRadialGradient(cx, cy, baseRadius * 0.48, cx, cy, baseRadius * 0.74);
        silverGrad.addColorStop(0, '#ffffff');
        silverGrad.addColorStop(0.5, '#e2e8f0');
        silverGrad.addColorStop(1, '#94a3b8');
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 0.74, 0, Math.PI * 2);
        this.ctx.fillStyle = silverGrad;
        this.ctx.fill();

        // Middle Silver Black Boundary
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 0.74, 0, Math.PI * 2);
        this.ctx.lineWidth = Math.max(3, baseRadius * 0.022);
        this.ctx.strokeStyle = '#000000';
        this.ctx.stroke();

        // Inner Red Ring
        const redGrad2 = this.ctx.createRadialGradient(cx, cy, baseRadius * 0.28, cx, cy, baseRadius * 0.48);
        redGrad2.addColorStop(0, '#f87171');
        redGrad2.addColorStop(0.7, '#ef4444');
        redGrad2.addColorStop(1, '#b91c1c');
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 0.48, 0, Math.PI * 2);
        this.ctx.fillStyle = redGrad2;
        this.ctx.fill();

        // Inner Red Black Boundary
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 0.48, 0, Math.PI * 2);
        this.ctx.lineWidth = Math.max(3, baseRadius * 0.022);
        this.ctx.strokeStyle = '#000000';
        this.ctx.stroke();

        // Center Cobalt/Stark Blue Disk
        const blueGrad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.28);
        blueGrad.addColorStop(0, '#60a5fa');
        blueGrad.addColorStop(0.7, '#2563eb');
        blueGrad.addColorStop(1, '#1e40af');
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 0.28, 0, Math.PI * 2);
        this.ctx.fillStyle = blueGrad;
        this.ctx.fill();

        // Center Blue Black Boundary
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, baseRadius * 0.28, 0, Math.PI * 2);
        this.ctx.lineWidth = Math.max(3, baseRadius * 0.022);
        this.ctx.strokeStyle = '#000000';
        this.ctx.stroke();

        // Center Luminous White 5-Point Star with Black Boundary
        this.drawStar(
            this.ctx,
            cx,
            cy,
            5,
            baseRadius * 0.25,
            baseRadius * 0.11,
            '#ffffff',
            '#000000',
            Math.max(2, baseRadius * 0.016)
        );

        // 4. Light Stark HUD Target Crosshair Marks
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        this.ctx.lineWidth = 1.4;

        const notchLen = baseRadius * 0.18;
        // Top
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - baseRadius * 1.25);
        this.ctx.lineTo(cx, cy - baseRadius * 1.25 + notchLen);
        this.ctx.stroke();

        // Bottom
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy + baseRadius * 1.25);
        this.ctx.lineTo(cx, cy + baseRadius * 1.25 - notchLen);
        this.ctx.stroke();

        // Left
        this.ctx.beginPath();
        this.ctx.moveTo(cx - baseRadius * 1.25, cy);
        this.ctx.lineTo(cx - baseRadius * 1.25 + notchLen, cy);
        this.ctx.stroke();

        // Right
        this.ctx.beginPath();
        this.ctx.moveTo(cx + baseRadius * 1.25, cy);
        this.ctx.lineTo(cx + baseRadius * 1.25 - notchLen, cy);
        this.ctx.stroke();

        this.ctx.restore();
    }

    private loop() {
        if (!this.isRunning) return;
        this.pulseTime += 0.02;
        this.drawBackground();
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
}

// Extend global window interface for development debugging
declare global {
    interface Window {
        bg3D?: Background3D;
        dashboard?: DashboardManager;
    }
}

// ==========================================
// Theme Manager System
// ==========================================
class ThemeManager {
    private static themeSelectEl: HTMLSelectElement | null = null;
    private static navThemeSelectEl: HTMLSelectElement | null = null;
    private static headerThemeSelectEl: HTMLSelectElement | null = null;
    private static sakuraAnim: SakuraAnimation | null = null;
    private static avengersAnim: AvengersAnimation | null = null;

    public static init() {
        this.sakuraAnim = new SakuraAnimation();
        this.avengersAnim = new AvengersAnimation();

        this.themeSelectEl = document.getElementById('theme-select') as HTMLSelectElement;
        this.navThemeSelectEl = document.getElementById('nav-theme-select') as HTMLSelectElement;
        this.headerThemeSelectEl = document.getElementById('header-theme-select') as HTMLSelectElement;

        const savedTheme = localStorage.getItem('cicr_vault_theme') || 'cyberpunk';
        this.applyTheme(savedTheme);

        if (this.themeSelectEl) {
            this.themeSelectEl.value = savedTheme;
            this.themeSelectEl.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                this.applyTheme(target.value);
            });
        }

        if (this.navThemeSelectEl) {
            this.navThemeSelectEl.value = savedTheme;
            this.navThemeSelectEl.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                this.applyTheme(target.value);
            });
        }

        if (this.headerThemeSelectEl) {
            this.headerThemeSelectEl.value = savedTheme;
            this.headerThemeSelectEl.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                this.applyTheme(target.value);
            });
        }
    }

    public static applyTheme(theme: string) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.remove('theme-light', 'theme-pink', 'theme-sakura', 'theme-avengers');
        if (theme === 'light') {
            document.body.classList.add('theme-light');
        } else if (theme === 'pink' || theme === 'sakura') {
            document.body.classList.add('theme-sakura');
        } else if (theme === 'avengers') {
            document.body.classList.add('theme-avengers');
        }
        localStorage.setItem('cicr_vault_theme', theme);

        if (this.themeSelectEl && this.themeSelectEl.value !== theme) {
            this.themeSelectEl.value = theme;
        }
        if (this.navThemeSelectEl && this.navThemeSelectEl.value !== theme) {
            this.navThemeSelectEl.value = theme;
        }
        if (this.headerThemeSelectEl && this.headerThemeSelectEl.value !== theme) {
            this.headerThemeSelectEl.value = theme;
        }

        if (window.bg3D) {
            window.bg3D.updateThemeColors(theme);
        }

        if (theme === 'sakura' || theme === 'pink') {
            this.sakuraAnim?.start();
            this.avengersAnim?.stop();
        } else if (theme === 'avengers') {
            this.sakuraAnim?.stop();
            this.avengersAnim?.start();
        } else {
            this.sakuraAnim?.stop();
            this.avengersAnim?.stop();
        }
    }
}

// ==========================================
// 7. Application Bootstrap
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    window.bg3D = new Background3D();
    ThemeManager.init();
    DatabaseManager.init();
    ModalManager.init();
    AuthManager.init();
    lucide.createIcons();

    // Global mouse-coordinate spotlight tracker for interactive cyber gridlines
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        document.documentElement.style.setProperty('--mouse-x', `${x}%`);
        document.documentElement.style.setProperty('--mouse-y', `${y}%`);
    });

    // Custom 3D tilt interaction logic matching Pinterest OVI interface
    const apply3DTilt = (el: HTMLElement, maxRotation: number = 10) => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -maxRotation;
            const rotateY = ((x - centerX) / centerX) * maxRotation;
            
            el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
            el.style.transition = 'none';
        });
        
        el.addEventListener('mouseleave', () => {
            el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`;
            el.style.transition = 'transform 0.5s ease';
        });
    };

    const welcomeTextContainer = document.querySelector('.welcome-huge-text') as HTMLElement;
    if (welcomeTextContainer) apply3DTilt(welcomeTextContainer, 15);

    // Setup navbar logo click event to slide the welcome screen down
    const navLogo = document.getElementById('nav-brand-logo');
    const welcomeScreen = document.getElementById('welcome-screen');
    if (navLogo && welcomeScreen) {
        navLogo.addEventListener('click', () => {
            welcomeScreen.style.display = 'flex';
            // Force reflow/redraw
            welcomeScreen.offsetHeight;
            welcomeScreen.style.transform = 'translateY(0)';
            welcomeScreen.style.transition = 'transform 0.8s cubic-bezier(0.85, 0, 0.15, 1)';
        });
    }



    // IntersectionObserver scroll reveal triggers matching Pinterest visual transition
    const revealElements = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, {
        threshold: 0.08,
        rootMargin: '0px 0px -60px 0px'
    });
    revealElements.forEach(el => observer.observe(el));


});
