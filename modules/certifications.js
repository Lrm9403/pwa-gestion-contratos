class Certifications {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('add-certification')?.addEventListener('click', () => this.showCertificationForm());
    }

    async loadCertifications() {
        if (!contracts.currentCompany || !auth.currentUser) return;
        
        try {
            const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', contracts.currentCompany.id);
            
            // Enriquecer certificaciones con datos del contrato
            const enrichedCerts = certifications.map(cert => {
                const contract = contractsList.find(c => c.id === cert.contractId);
                return {
                    ...cert,
                    contractCode: contract?.code || 'N/A',
                    contractValue: contract?.serviceValue || 0
                };
            });
            
            this.renderCertifications(enrichedCerts);
        } catch (error) {
            console.error('Error al cargar certificaciones:', error);
        }
    }

    renderCertifications(certifications) {
        const tbody = document.getElementById('certifications-list');
        tbody.innerHTML = '';
        
        certifications.forEach(cert => {
            const salaryGenerated = cert.amount * (cert.salaryPercentage / 100);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cert.contractCode}</td>
                <td>${cert.month}/${cert.year}</td>
                <td>$${cert.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>$${salaryGenerated.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td><span class="status ${cert.status}">${cert.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="certifications.editCertification('${cert.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="certifications.deleteCertification('${cert.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async showCertificationForm(certification = null) {
        if (!contracts.currentCompany) {
            auth.showMessage('Primero selecciona una empresa', 'error');
            return;
        }
        
        const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
        const contractsOptions = contractsList.map(c => 
            `<option value="${c.id}" ${certification?.contractId === c.id ? 'selected' : ''}>
                ${c.code} - ${c.client}
            </option>`
        ).join('');
        
        const title = certification ? 'Editar Certificación' : 'Nueva Certificación';
        const form = `
            <div class="form-group">
                <label for="cert-contract">Contrato:</label>
                <select id="cert-contract" required>
                    <option value="">Seleccionar contrato</option>
                    ${contractsOptions}
                </select>
            </div>
            <div class="form-group">
                <label for="cert-month">Mes:</label>
                <select id="cert-month" required>
                    <option value="">Seleccionar mes</option>
                    ${Array.from({length: 12}, (_, i) => 
                        `<option value="${i+1}" ${certification?.month === i+1 ? 'selected' : ''}>
                            ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][i]}
                        </option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="cert-year">Año:</label>
                <input type="number" id="cert-year" min="2020" max="2030" value="${certification?.year || new Date().getFullYear()}" required>
            </div>
            <div class="form-group">
                <label for="cert-amount">Monto Certificado ($):</label>
                <input type="number" id="cert-amount" step="0.01" value="${certification?.amount || ''}" required>
            </div>
            <div class="form-group">
                <label for="cert-status">Estado:</label>
                <select id="cert-status">
                    <option value="pendiente" ${certification?.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="aprobado" ${certification?.status === 'aprobado' ? 'selected' : ''}>Aprobado</option>
                    <option value="pagado" ${certification?.status === 'pagado' ? 'selected' : ''}>Pagado</option>
                </select>
            </div>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.saveCertification(certification?.id)
        });
    }

    async saveCertification(id = null) {
        const contractId = document.getElementById('cert-contract').value;
        const contract = await db.get('contracts', contractId);
        
        if (!contract) {
            auth.showMessage('Selecciona un contrato válido', 'error');
            return;
        }
        
        const certification = {
            contractId: contractId,
            month: parseInt(document.getElementById('cert-month').value),
            year: parseInt(document.getElementById('cert-year').value),
            amount: parseFloat(document.getElementById('cert-amount').value),
            salaryPercentage: contract.salaryPercentage,
            status: document.getElementById('cert-status').value,
            companyId: contracts.currentCompany.id,
            userId: auth.currentUser.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (!certification.contractId || !certification.month || !certification.year || isNaN(certification.amount)) {
            auth.showMessage('Por favor completa todos los campos requeridos', 'error');
            return;
        }
        
        try {
            if (id) {
                await db.update('certifications', id, certification);
                auth.showMessage('Certificación actualizada exitosamente', 'success');
            } else {
                await db.add('certifications', certification);
                auth.showMessage('Certificación creada exitosamente', 'success');
            }
            
            modal.hide();
            this.loadCertifications();
            salary.updateSalarySummary();
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: contracts.currentCompany.id,
                type: id ? 'cert_update' : 'cert_create',
                description: `${id ? 'Actualizada' : 'Creada'} certificación ${certification.month}/${certification.year}`
            });
            
        } catch (error) {
            auth.showMessage('Error al guardar la certificación', 'error');
            console.error(error);
        }
    }

    async editCertification(id) {
        try {
            const certification = await db.get('certifications', id);
            if (certification) {
                this.showCertificationForm(certification);
            }
        } catch (error) {
            console.error('Error al cargar certificación:', error);
        }
    }

    async deleteCertification(id) {
        if (!confirm('¿Estás seguro de eliminar esta certificación?')) return;
        
        try {
            await db.delete('certifications', id);
            auth.showMessage('Certificación eliminada exitosamente', 'success');
            this.loadCertifications();
            salary.updateSalarySummary();
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: contracts.currentCompany.id,
                type: 'cert_delete',
                description: 'Eliminada certificación'
            });
            
        } catch (error) {
            auth.showMessage('Error al eliminar la certificación', 'error');
            console.error(error);
        }
    }
}

const certifications = new Certifications();
