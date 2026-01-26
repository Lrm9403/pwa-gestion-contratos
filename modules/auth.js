class Auth {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        // Verificar si hay usuario guardado
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                this.updateUI();
                this.showApp();
            } catch (error) {
                console.error('Error al parsear usuario guardado:', error);
                localStorage.removeItem('currentUser');
            }
        }
        
        // Configurar event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('login-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.login();
        });
        
        document.getElementById('register-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.register();
        });
        
        document.getElementById('show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegister();
        });
        
        document.getElementById('show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLogin();
        });
        
        document.getElementById('logout-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });
        
        // Permitir Enter en formularios
        document.getElementById('login-password')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.login();
            }
        });
        
        document.getElementById('register-confirm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.register();
            }
        });
    }

    async login() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            this.showMessage('Por favor completa todos los campos', 'error');
            return;
        }
        
        this.showLoading(true);
        
        try {
            // Esperar a que la base de datos esté lista
            await db.ready();
            
            const user = await db.getUserByEmail(email);
            
            if (!user || user.password !== this.hashPassword(password)) {
                this.showMessage('Email o contraseña incorrectos', 'error');
                return;
            }
            
            this.currentUser = {
                ...user,
                lastLogin: new Date().toISOString()
            };
            
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            
            // Actualizar último login
            await db.update('users', user.id, {
                ...user,
                lastLogin: new Date().toISOString()
            });
            
            this.showMessage('¡Bienvenido!', 'success');
            this.showApp();
            this.updateUI();
            
            // Registrar actividad
            await db.addActivity({
                userId: user.id,
                companyId: null,
                type: 'login',
                description: 'Usuario inició sesión'
            });
            
            // Cargar empresas del usuario
            if (window.companies) {
                await companies.loadCompanies();
            }
            
        } catch (error) {
            console.error('Error al iniciar sesión:', error);
            this.showMessage('Error al iniciar sesión. Intenta de nuevo.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async register() {
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        
        if (!name || !email || !password || !confirm) {
            this.showMessage('Por favor completa todos los campos', 'error');
            return;
        }
        
        if (password !== confirm) {
            this.showMessage('Las contraseñas no coinciden', 'error');
            return;
        }
        
        if (password.length < 6) {
            this.showMessage('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        
        if (!this.validateEmail(email)) {
            this.showMessage('Email inválido', 'error');
            return;
        }
        
        this.showLoading(true);
        
        try {
            await db.ready();
            
            const existingUser = await db.getUserByEmail(email);
            if (existingUser) {
                this.showMessage('Este email ya está registrado', 'error');
                return;
            }
            
            const user = {
                name,
                email,
                password: this.hashPassword(password),
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
            
            const userId = await db.add('users', user);
            user.id = userId;
            
            this.showMessage('¡Cuenta creada exitosamente!', 'success');
            
            // Iniciar sesión automáticamente
            this.currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            this.showApp();
            this.updateUI();
            
            // Registrar actividad
            await db.addActivity({
                userId: userId,
                companyId: null,
                type: 'register',
                description: 'Nuevo usuario registrado'
            });
            
        } catch (error) {
            console.error('Error al crear la cuenta:', error);
            this.showMessage('Error al crear la cuenta. Intenta de nuevo.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    logout() {
        if (!confirm('¿Estás seguro de cerrar sesión?')) {
            return;
        }
        
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentCompany');
        localStorage.removeItem('userCompanies');
        
        this.showLogin();
        this.showMessage('Sesión cerrada exitosamente', 'info');
    }

    showRegister() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('register-screen').classList.add('active');
        
        // Limpiar formulario
        document.getElementById('register-name').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm').value = '';
        
        // Enfocar primer campo
        document.getElementById('register-name').focus();
    }

    showLogin() {
        document.getElementById('register-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        
        // Limpiar formulario
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        
        // Enfocar primer campo
        document.getElementById('login-email').focus();
    }

    showApp() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('register-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
    }

    updateUI() {
        const userNameElement = document.getElementById('user-name');
        if (userNameElement && this.currentUser) {
            userNameElement.textContent = this.currentUser.name;
        }
    }

    hashPassword(password) {
        // En una aplicación real, usarías un hash seguro como bcrypt
        // Esta es una implementación básica solo para demostración
        return btoa(password);
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    showLoading(show) {
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        
        if (loginBtn) {
            if (show) {
                loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
                loginBtn.disabled = true;
            } else {
                loginBtn.innerHTML = 'Ingresar';
                loginBtn.disabled = false;
            }
        }
        
        if (registerBtn) {
            if (show) {
                registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
                registerBtn.disabled = true;
            } else {
                registerBtn.innerHTML = 'Crear Cuenta';
                registerBtn.disabled = false;
            }
        }
    }

    showMessage(message, type) {
        // Eliminar mensaje anterior si existe
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;
        messageDiv.textContent = message;
        
        // Estilos CSS
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease;
        `;
        
        // Colores según tipo
        const colors = {
            success: '#4caf50',
            error: '#f44336',
            info: '#2196f3',
            warning: '#ff9800'
        };
        
        messageDiv.style.background = colors[type] || colors.info;
        
        document.body.appendChild(messageDiv);
        
        // Remover después de 3 segundos
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, 3000);
        
        // Agregar animaciones CSS si no existen
        if (!document.querySelector('#message-animations')) {
            const style = document.createElement('style');
            style.id = 'message-animations';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Inicializar autenticación
let auth;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    auth = new Auth();
    window.auth = auth;
});
