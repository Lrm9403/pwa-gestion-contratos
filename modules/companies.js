class Companies {
    constructor() {
        this.currentCompany = null;
        this.utils = window.contractAppUtils;
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

        this.loadCurrentCompany();
    }

    async loadCurrentCompany() {
        try {
            const savedCompany = localStorage.getItem('currentCompany');
            if (savedCompany) {
                this.currentCompany = JSON.parse(savedCompany);
                this.updateCompanyUI();
                this.notifyCompanyChange();
            }
        } catch (error) {
            console.error('Error al cargar empresa:', error);
            this.currentCompany = null;
        }
    }

    async loadCompanies() {
        if (!auth?.currentUser) return;

        try {
            const companies = await db.getCompaniesByUser(auth.currentUser.id);
            localStorage.setItem('userCompanies', JSON.stringify(companies));
            this.updateCompanySelector(companies);
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
                <p><strong>% Impuestos:</strong> ${this.utils.formatPercentage(company.taxPercentage, company.taxPercentageRaw)}</p>
                <p><strong>Dirección:</strong> ${company.address || 'No especificada'}</p>
                <p><strong>Teléfono:</strong> ${company.phone || 'No especificado'}</p>
                <p><strong>Email:</strong> ${company.email || 'No especificado'}</p>
                <div class="company-actions">
                    <button class="btn btn-sm btn-primary" onclick="companies.selectCompany('${company.id}')">Seleccionar</button>
                    <button class="btn btn-sm btn-secondary" onclick="companies.editCompany('${company.id}')">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="companies.deleteCompany('${company.id}')"><i class="fas fa-trash"></i></button>
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
                <label for="company-tax-percentage">% de impuestos *:</label>
                <input type="number" id="company-tax-percentage" min="0" max="100" step="0.01" value="${company?.taxPercentageRaw ?? company?.taxPercentage ?? 0}" required>
                <small>Este porcentaje se aplicará sobre el valor del servicio para calcular el valor total del contrato y de las certificaciones.</small>
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
            title,
            body: form,
            onSave: () => this.saveCompany(company?.id)
        });
    }

    async saveCompany(id = null) {
        const name = document.getElementById('company-name').value.trim();
        const taxId = document.getElementById('company-taxId').value.trim();
        const taxPercentageInput = this.utils.parsePercentageInput(document.getElementById('company-tax-percentage').value);
        const taxPercentage = taxPercentageInput.value;
        const address = document.getElementById('company-address').value.trim();
        const phone = document.getElementById('company-phone').value.trim();
        const email = document.getElementById('company-email').value.trim();

        if (!name) {
            this.showMessage('El nombre de la empresa es requerido', 'error');
            return;
        }

        if (taxPercentage < 0 || taxPercentage > 100) {
            this.showMessage('El % de impuestos debe estar entre 0 y 100', 'error');
            return;
        }

        const company = {
            name,
            taxId,
            taxPercentage,
            taxPercentageRaw: taxPercentageInput.raw,
            address,
            phone,
            email,
            userId: auth.currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            let companyId = id;
            if (id) {
                const existingCompany = await db.get('companies', id);
                if (!existingCompany) {
                    this.showMessage('Empresa no encontrada', 'error');
                    return;
                }
                company.createdAt = existingCompany.createdAt;
                await db.update('companies', id, company);
                this.showMessage('Empresa actualizada exitosamente', 'success');
            } else {
                companyId = await db.add('companies', company);
                this.showMessage('Empresa creada exitosamente', 'success');
            }

            modal.hide();
            await this.loadCompanies();
            await this.selectCompany(companyId, false);

            await db.addActivity({
                userId: auth.currentUser.id,
                companyId,
                type: id ? 'company_update' : 'company_create',
                description: `${id ? 'Actualizada' : 'Creada'} empresa ${name}`
            });
        } catch (error) {
            console.error('Error al guardar empresa:', error);
            this.showMessage(`Error al guardar la empresa: ${error.message}`, 'error');
        }
    }

    async selectCompany(companyId, notifyMessage = true) {
        if (!companyId) {
            this.currentCompany = null;
            localStorage.removeItem('currentCompany');
            this.updateCompanyUI();
            this.notifyCompanyChange();
            return;
        }

        try {
            const company = await db.get('companies', companyId);
            if (!company) {
                this.showMessage('Empresa no encontrada', 'error');
                return;
            }

            this.currentCompany = company;
            localStorage.setItem('currentCompany', JSON.stringify(company));
            this.updateCompanyUI();

            const select = document.getElementById('company-select');
            if (select) select.value = companyId;

            this.notifyCompanyChange();
            if (notifyMessage) {
                this.showMessage(`Empresa "${company.name}" seleccionada`, 'success');
            }
        } catch (error) {
            console.error('Error al seleccionar empresa:', error);
            this.showMessage('Error al seleccionar empresa', 'error');
        }
    }

    async editCompany(id) {
        const company = await db.get('companies', id);
        if (company) {
            this.showCompanyForm(company);
        } else {
            this.showMessage('Empresa no encontrada', 'error');
        }
    }

    async deleteCompany(id) {
        if (!confirm('¿Estás seguro de eliminar esta empresa? También se eliminarán contratos, certificaciones, facturas, pagos y actividades asociadas.')) {
            return;
        }

        try {
            if (this.currentCompany?.id === id) {
                this.currentCompany = null;
                localStorage.removeItem('currentCompany');
            }

            await this.deleteCompanyData(id);
            this.updateCompanyUI();
            this.notifyCompanyChange();
            await this.loadCompanies();
            this.showMessage('Empresa eliminada exitosamente', 'success');
        } catch (error) {
            console.error('Error al eliminar empresa:', error);
            this.showMessage('Error al eliminar la empresa', 'error');
        }
    }

    async deleteCompanyData(companyId) {
        const [contractsList, certificationsList, invoicesList, paymentsList, activitiesList] = await Promise.all([
            db.getAll('contracts', 'companyId', companyId),
            db.getAll('certifications', 'companyId', companyId),
            db.getAll('invoices', 'companyId', companyId),
            db.getAll('payments', 'companyId', companyId),
            db.getAll('activities', 'companyId', companyId)
        ]);

        for (const certification of certificationsList) await db.delete('certifications', certification.id);
        for (const invoice of invoicesList) await db.delete('invoices', invoice.id);
        for (const payment of paymentsList) await db.delete('payments', payment.id);
        for (const contract of contractsList) await db.delete('contracts', contract.id);
        for (const activity of activitiesList) await db.delete('activities', activity.id);
        await db.delete('companies', companyId);
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
        if (!currentCompanyElement) return;

        if (this.currentCompany) {
            currentCompanyElement.textContent = `${this.currentCompany.name} · Impuesto ${this.utils.formatPercentage(this.currentCompany.taxPercentage, this.currentCompany.taxPercentageRaw)}`;
            currentCompanyElement.style.color = 'var(--primary-color)';
            currentCompanyElement.style.fontWeight = 'bold';
        } else {
            currentCompanyElement.textContent = 'No seleccionada';
            currentCompanyElement.style.color = 'var(--gray-color)';
            currentCompanyElement.style.fontWeight = 'normal';
        }
    }

    notifyCompanyChange() {
        document.dispatchEvent(new CustomEvent('companyChanged', {
            detail: { company: this.currentCompany }
        }));
    }

    showMessage(message, type) {
        if (window.auth?.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

let companies;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    companies = new Companies();
    window.companies = companies;
});
