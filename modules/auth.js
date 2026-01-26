class Auth {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        // Verificar si hay usuario guardado
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.updateUI();
        }
        
        // Configurar event listeners
        document.getElementById('login-btn')?.addEventListener('click', () => this.login());
        document.getElementById('register-btn')?.addEventListener('click', () => this.register());
        document.getElementById('show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegister();
        });
        document.getElementById('show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLogin();
        });
        document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
    }

    async login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            this.showMessage('Por favor completa todos los campos', 'error');
            return;
        }
        
        try {
            const user = await db.getUserByEmail(email);
            
            if (!user || user.password !== this.hashPassword(password)) {
                this.showMessage('Email o contraseña incorrectos', 'error');
                return;
            }
            
            this.currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
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
            
        } catch (error) {
            this.showMessage('Error al iniciar sesión', 'error');
            console.error(error);
        }
    }

    async register() {
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
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
        
        try {
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
            
            await db.add('users', user);
            this.showMessage('¡Cuenta creada exitosamente!', 'success');
            this.showLogin();
            
        } catch (error) {
            this.showMessage('Error al crear la cuenta', 'error');
            console.error(error);
        }
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentCompany');
        this.showLogin();
    }

    showRegister() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('register-screen').classList.add('active');
    }

    showLogin() {
        document.getElementById('register-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
    }

    showApp() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('register-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
    }

    updateUI() {
        if (this.currentUser) {
            document.getElementById('user-name').textContent = this.currentUser.name;
        }
    }

    hashPassword(password) {
        // En una aplicación real, usarías un hash seguro como bcrypt
        // Esta es una implementación básica solo para demostración
        return btoa(password);
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
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        if (type === 'success') {
            messageDiv.style.background = 'var(--success-color)';
        } else if (type === 'error') {
            messageDiv.style.background = 'var(--danger-color)';
        } else {
            messageDiv.style.background = 'var(--primary-color)';
        }
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => messageDiv.remove(), 300);
        }, 3000);
    }
}

// Inicializar autenticación
const auth = new Auth();
