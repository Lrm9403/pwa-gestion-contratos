class Companies {
    constructor() {
        this.currentCompany = null;
        this.init();
    }

    init() {
        document.getElementById('add-company')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showCompanyForm();
        });
        
        document.getElementById('company-select')?.addEventListener('change', (e) => {
            this.onCompanyChange(e.target.value);
        });
        
        // Cargar empresa actual
        this.loadCurrentCompany();
    }

    async loadCurrentCompany() {
        try {
            const savedCompany = localStorage.getItem('currentCompany');
            if (savedCompany) {
                this.currentCompany = JSON.parse(savedCompany);
                this.updateCompanyUI();
                
                // Notificar a otros módulos que la empresa ha cambiado
                this.notifyCompanyChange();
            }
        } catch (error) {
            console.error('Error al cargar empresa:', error);
            this.currentCompany = null;
        }
    }

    async loadCompanies() {
        if (!auth?.currentUser) {
            console.log('Usuario no autenticado');
            return;
        }
        
        try {
            const companies = await db.getCompaniesByUser(auth.currentUser.id);
            console.log('Empresas encontradas:', companies);
            
            // Guardar en localStorage
            localStorage.setItem('userCompanies', JSON.stringify(companies));
            
            // Actualizar selector
            this.updateCompanySelector(companies);
            
            // Mostrar lista de empresas
            this.renderCompaniesList(companies);
            
        } catch (error) {
            console.error('Error al cargar empresas:', error);
            this.showMessage('Error al cargar empresas', 'error');
        }
    }

    updateCompanySelector(companies) {
        const select = document.getElementById('company-select');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleccionar empresa</option>';
        
        companies.forEach(company => {
            const option = document.createElement('option');
            option.value = company.id;
            option.textContent = company.name;
            select.appendChild(option);
        });
        
        // Seleccionar empresa actual si existe
        if (this.currentCompany) {
            select.value = this.currentCompany.id;
        }
    }

    renderCompaniesList(companies) {
        const container = document.getElementById('companies-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (companies.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-building" style="font-size: 3rem; color: #ccc; margin-bottom: 20px;"></i>
                    <h3>No hay empresas registradas</h3>
                    <p>Haz clic en "Nueva Empresa" para agregar una</p>
                </div>
            `;
            return;
        }
        
        companies.forEach(company => {
            const card = document.createElement('div');
            card.className = 'company-card';
            card.innerHTML = `
                <h3>${company.name}</h3>
                <p><strong>RUC/RIF:</strong> ${company.taxId || 'No especificado'}</p>
                <p><strong>Dirección:</strong> ${company.address || 'No especificada'}</p>
                <p><strong>Teléfono:</strong> ${company.phone || 'No especificado'}</p>
                <p><strong>Email:</strong> ${company.email || 'No especificado'}</p>
                <div class="company-actions">
                    <button class="btn btn-sm btn-primary" onclick="companies.selectCompany('${company.id}')">
                        Seleccionar
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="companies.editCompany('${company.id}')">
                        Editar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="companies.deleteCompany('${company.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    showCompanyForm(company = null) {
        const title = company ? 'Editar Empresa' : 'Nueva Empresa';
        const form = `
            <div class="form-group">
                <label for="company-name">Nombre de la Empresa *:</label>
                <input type="text" id="company-name" value="${company?.name || ''}" required>
            </div>
            <div class="form-group">
                <label for="company-taxId">RUC/RIF:</label>
                <input type="text" id="company-taxId" value="${company?.taxId || ''}">
            </div>
            <div class="form-group">
                <label for="company-address">Dirección:</label>
                <textarea id="company-address" rows="2">${company?.address || ''}</textarea>
            </div>
            <div class="form-group">
                <label for="company-phone">Teléfono:</label>
                <input type="tel" id="company-phone" value="${company?.phone || ''}">
            </div>
            <div class="form-group">
                <label for="company-email">Email:</label>
                <input type="email" id="company-email" value="${company?.email || ''}">
            </div>
            <p><small>* Campo obligatorio</small></p>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.saveCompany(company?.id)
        });
    }

    async saveCompany(id = null) {
        const name = document.getElementById('company-name').value.trim();
        const taxId = document.getElementById('company-taxId').value.trim();
        const address = document.getElementById('company-address').value.trim();
        const phone = document.getElementById('company-phone').value.trim();
        const email = document.getElementById('company-email').value.trim();
        
        if (!name) {
            this.showMessage('El nombre de la empresa es requerido', 'error');
            return;
        }
        
        if (!auth?.currentUser) {
            this.showMessage('Usuario no autenticado', 'error');
            return;
        }
        
        const company = {
            name,
            taxId,
            address,
            phone,
            email,
            userId: auth.currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        try {
            let companyId;
            
            if (id) {
                // Actualizar empresa existente
                const existingCompany = await db.get('companies', id);
                if (existingCompany) {
                    company.createdAt = existingCompany.createdAt;
                    await db.update('companies', id, company);
                    companyId = id;
                    this.showMessage('Empresa actualizada exitosamente', 'success');
                } else {
                    this.showMessage('Empresa no encontrada', 'error');
                    return;
                }
            } else {
                // Crear nueva empresa
                companyId = await db.add('companies', company);
                this.showMessage('Empresa creada exitosamente', 'success');
            }
            
            modal.hide();
            
            // Recargar la lista de empresas
            await this.loadCompanies();
            
            // Si es nueva empresa, seleccionarla automáticamente
            if (!id) {
                const companies = await db.getCompaniesByUser(auth.currentUser.id);
                const newCompany = companies.find(c => c.id === companyId);
                if (newCompany) {
                    await this.selectCompany(companyId);
                }
            } else if (id === this.currentCompany?.id) {
                // Si estamos editando la empresa actual, actualizarla
                const updatedCompany = await db.get('companies', id);
                if (updatedCompany) {
                    this.currentCompany = updatedCompany;
                    localStorage.setItem('currentCompany', JSON.stringify(updatedCompany));
                    this.updateCompanyUI();
                    this.notifyCompanyChange();
                }
            }
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: companyId,
                type: id ? 'company_update' : 'company_create',
                description: `${id ? 'Actualizada' : 'Creada'} empresa ${name}`
            });
            
        } catch (error) {
            console.error('Error al guardar empresa:', error);
            this.showMessage('Error al guardar la empresa: ' + error.message, 'error');
        }
    }

    async selectCompany(companyId) {
        try {
            const company = await db.get('companies', companyId);
            if (!company) {
                this.showMessage('Empresa no encontrada', 'error');
                return;
            }
            
            this.currentCompany = company;
            localStorage.setItem('currentCompany', JSON.stringify(company));
            
            // Actualizar UI
            this.updateCompanyUI();
            
            // Actualizar selector
            const select = document.getElementById('company-select');
            if (select) {
                select.value = companyId;
            }
            
            // Notificar cambio a otros módulos
            this.notifyCompanyChange();
            
            this.showMessage(`Empresa "${company.name}" seleccionada`, 'success');
            
            // Cambiar a la sección de dashboard
            app.showSection('dashboard');
            
        } catch (error) {
            console.error('Error al seleccionar empresa:', error);
            this.showMessage('Error al seleccionar empresa', 'error');
        }
    }

    async editCompany(id) {
        try {
            const company = await db.get('companies', id);
            if (company) {
                this.showCompanyForm(company);
            } else {
                this.showMessage('Empresa no encontrada', 'error');
            }
        } catch (error) {
            console.error('Error al cargar empresa:', error);
            this.showMessage('Error al cargar la empresa', 'error');
        }
    }

    async deleteCompany(id) {
        if (!confirm('¿Estás seguro de eliminar esta empresa? También se eliminarán todos los contratos, certificaciones y pagos asociados.')) {
            return;
        }
        
        try {
            // Verificar si es la empresa actual
            if (this.currentCompany?.id === id) {
                this.currentCompany = null;
                localStorage.removeItem('currentCompany');
                this.updateCompanyUI();
                this.notifyCompanyChange();
            }
            
            // Eliminar empresa y datos asociados
            await this.deleteCompanyData(id);
            
            // Recargar empresas
            await this.loadCompanies();
            
            this.showMessage('Empresa eliminada exitosamente', 'success');
            
        } catch (error) {
            console.error('Error al eliminar empresa:', error);
            this.showMessage('Error al eliminar la empresa', 'error');
        }
    }

    async deleteCompanyData(companyId) {
        try {
            // Eliminar contratos y sus dependencias
            const contracts = await db.getAll('contracts', 'companyId', companyId);
            for (const contract of contracts) {
                // Eliminar certificaciones del contrato
                const certifications = await db.getAll('certifications', 'contractId', contract.id);
                for (const cert of certifications) {
                    await db.delete('certifications', cert.id);
                }
                
                // Eliminar pagos del contrato
                const payments = await db.getAll('payments', 'contractId', contract.id);
                for (const payment of payments) {
                    await db.delete('payments', payment.id);
                }
                
                // Eliminar el contrato
                await db.delete('contracts', contract.id);
            }
            
            // Eliminar actividades de la empresa
            const activities = await db.getAll('activities', 'companyId', companyId);
            for (const activity of activities) {
                await db.delete('activities', activity.id);
            }
            
            // Eliminar la empresa
            await db.delete('companies', companyId);
            
            return true;
            
        } catch (error) {
            console.error('Error al eliminar datos de la empresa:', error);
            throw error;
        }
    }

    onCompanyChange(companyId) {
        if (companyId) {
            this.selectCompany(companyId);
        } else {
            this.currentCompany = null;
            localStorage.removeItem('currentCompany');
            this.updateCompanyUI();
            this.notifyCompanyChange();
        }
    }

    updateCompanyUI() {
        const currentCompanyElement = document.getElementById('current-company');
        if (currentCompanyElement) {
            if (this.currentCompany) {
                currentCompanyElement.textContent = this.currentCompany.name;
                currentCompanyElement.style.color = 'var(--primary-color)';
                currentCompanyElement.style.fontWeight = 'bold';
            } else {
                currentCompanyElement.textContent = 'No seleccionada';
                currentCompanyElement.style.color = 'var(--gray-color)';
                currentCompanyElement.style.fontWeight = 'normal';
            }
        }
    }

    notifyCompanyChange() {
        // Disparar evento personalizado para que otros módulos se actualicen
        const event = new CustomEvent('companyChanged', { 
            detail: { company: this.currentCompany }
        });
        document.dispatchEvent(event);
    }

    showMessage(message, type) {
        if (window.auth && auth.showMessage) {
            auth.showMessage(message, type);
        } else {
            const colors = {
                success: '#4caf50',
                error: '#f44336',
                info: '#2196f3',
                warning: '#ff9800'
            };
            
            // Crear mensaje temporal
            const messageDiv = document.createElement('div');
            messageDiv.textContent = message;
            messageDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                background: ${colors[type] || colors.info};
                color: white;
                border-radius: 5px;
                z-index: 10000;
                font-weight: bold;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                animation: slideIn 0.3s ease;
            `;
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (messageDiv.parentNode) {
                        messageDiv.parentNode.removeChild(messageDiv);
                    }
                }, 300);
            }, 3000);
        }
    }
}

// Inicializar después de que la base de datos esté lista
let companies;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    companies = new Companies();
    window.companies = companies;
});
