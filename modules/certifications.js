class Certifications {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('add-certification')?.addEventListener('click', () => this.showCertificationForm());
        
        // Escuchar cambios de empresa
        document.addEventListener('companyChanged', () => this.loadCertifications());
    }

    async loadCertifications() {
        if (!companies?.currentCompany || !auth.currentUser) {
            console.log('No hay empresa seleccionada para cargar certificaciones');
            return;
        }
        
        try {
            const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', companies.currentCompany.id);
            
            // Enriquecer certificaciones con datos del contrato
            const enrichedCerts = certifications.map(cert => {
                const contract = contracts.find(c => c.id === cert.contractId);
                const serviceValue = cert.amount || 0;
                const contractValue = serviceValue * 1.15; // +15%
                const salaryGenerated = serviceValue * ((contract?.salaryPercentage || 0) / 100);
                
                return {
                    ...cert,
                    contractCode: contract?.code || 'N/A',
                    contractClient: contract?.client || 'N/A',
                    salaryPercentage: contract?.salaryPercentage || 0,
                    serviceValue: serviceValue,
                    contractValue: contractValue,
                    salaryGenerated: salaryGenerated
                };
            });
            
            this.renderCertifications(enrichedCerts);
        } catch (error) {
            console.error('Error al cargar certificaciones:', error);
            this.showMessage('Error al cargar certificaciones', 'error');
        }
    }

    renderCertifications(certifications) {
        const tbody = document.getElementById('certifications-list');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (certifications.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="7" style="text-align: center; padding: 20px;">
                    No hay certificaciones registradas. Haz clic en "Nueva Certificación" para agregar una.
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        // Ordenar por año y mes descendente
        certifications.sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month - a.month;
        });
        
        certifications.forEach(cert => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cert.contractCode}<br><small>${cert.contractClient}</small></td>
                <td>${this.getMonthName(cert.month)}/${cert.year}</td>
                <td>
                    <strong>Servicio:</strong> $${cert.serviceValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}<br>
                    <small>Contrato (+15%): $${cert.contractValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</small>
                </td>
                <td>$${cert.salaryGenerated.toLocaleString('es-ES', { minimumFractionDigits: 2 })}<br>
                    <small>(${cert.salaryPercentage}% del servicio)</small>
                </td>
                <td><span class="status ${cert.status}">${cert.status || 'pendiente'}</span></td>
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

    getMonthName(month) {
        const months = [
            'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
            'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
        ];
        return months[month - 1] || month;
    }

    async showCertificationForm(certification = null) {
        if (!companies?.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }
        
        const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
        const activeContracts = contracts.filter(c => c.status === 'activo');
        
        if (activeContracts.length === 0) {
            this.showMessage('No hay contratos activos para crear certificaciones', 'error');
            return;
        }
        
        const contractsOptions = activeContracts.map(c => 
            `<option value="${c.id}" data-percentage="${c.salaryPercentage}" ${certification?.contractId === c.id ? 'selected' : ''}>
                ${c.code} - ${c.client} (${c.salaryPercentage}%)
            </option>`
        ).join('');
        
        const title = certification ? 'Editar Certificación' : 'Nueva Certificación';
        const form = `
            <div class="form-group">
                <label for="cert-contract">Contrato *:</label>
                <select id="cert-contract" required>
                    <option value="">Seleccionar contrato</option>
                    ${contractsOptions}
                </select>
            </div>
            <div class="form-group">
                <label for="cert-month">Mes *:</label>
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
                <label for="cert-year">Año *:</label>
                <input type="number" id="cert-year" min="2020" max="2030" 
                       value="${certification?.year || new Date().getFullYear()}" required>
            </div>
            <div class="form-group">
                <label for="cert-amount">Monto del Servicio ($) *:</label>
                <input type="number" id="cert-amount" step="0.01" min="0" 
                       value="${certification?.amount || ''}" required>
                <small>Valor base del servicio (sin el 15% del contrato)</small>
            </div>
            <div class="form-group">
                <label for="cert-status">Estado:</label>
                <select id="cert-status">
                    <option value="pendiente" ${(certification?.status || 'pendiente') === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="aprobado" ${certification?.status === 'aprobado' ? 'selected' : ''}>Aprobado</option>
                    <option value="pagado" ${certification?.status === 'pagado' ? 'selected' : ''}>Pagado</option>
                </select>
            </div>
            <div class="form-group">
                <label for="cert-notes">Notas (opcional):</label>
                <textarea id="cert-notes" rows="3">${certification?.notes || ''}</textarea>
            </div>
            <div id="cert-preview" style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 15px; display: none;">
                <h4>Resumen:</h4>
                <p><strong>Valor del Servicio:</strong> $<span id="preview-service">0.00</span></p>
                <p><strong>Valor del Contrato (+15%):</strong> $<span id="preview-contract">0.00</span></p>
                <p><strong>Salario Generado:</strong> $<span id="preview-salary">0.00</span> (<span id="preview-percentage">0</span>%)</p>
            </div>
            <p><small>* Campo obligatorio</small></p>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.saveCertification(certification?.id)
        });
        
        // Configurar eventos para el preview
        const amountInput = document.getElementById('cert-amount');
        const contractSelect = document.getElementById('cert-contract');
        const previewDiv = document.getElementById('cert-preview');
        
        const updatePreview = () => {
            const amount = parseFloat(amountInput.value) || 0;
            const selectedOption = contractSelect.options[contractSelect.selectedIndex];
            const salaryPercentage = selectedOption ? parseFloat(selectedOption.dataset.percentage) || 0 : 0;
            
            const contractValue = amount * 1.15;
            const salaryGenerated = amount * (salaryPercentage / 100);
            
            document.getElementById('preview-service').textContent = amount.toFixed(2);
            document.getElementById('preview-contract').textContent = contractValue.toFixed(2);
            document.getElementById('preview-salary').textContent = salaryGenerated.toFixed(2);
            document.getElementById('preview-percentage').textContent = salaryPercentage;
            
            previewDiv.style.display = 'block';
        };
        
        amountInput.addEventListener('input', updatePreview);
        contractSelect.addEventListener('change', updatePreview);
        
        // Inicializar preview si hay datos
        if (certification?.amount) {
            updatePreview();
        }
    }

    async saveCertification(id = null) {
        const contractId = document.getElementById('cert-contract').value;
        const month = document.getElementById('cert-month').value;
        const year = document.getElementById('cert-year').value;
        const amount = parseFloat(document.getElementById('cert-amount').value);
        const status = document.getElementById('cert-status').value;
        const notes = document.getElementById('cert-notes').value;
        
        // Validaciones
        if (!contractId || !month || !year || isNaN(amount) || amount <= 0) {
            this.showMessage('Por favor completa todos los campos requeridos correctamente', 'error');
            return;
        }
        
        try {
            const contract = await db.get('contracts', contractId);
            if (!contract) {
                this.showMessage('Contrato no encontrado', 'error');
                return;
            }
            
            // Verificar si ya existe una certificación para este mes/año/contrato
            if (!id) {
                const existingCerts = await db.getAll('certifications', 'contractId', contractId);
                const duplicate = existingCerts.find(c => c.month == month && c.year == year);
                if (duplicate) {
                    this.showMessage(`Ya existe una certificación para ${month}/${year} en este contrato`, 'error');
                    return;
                }
            }
            
            const certification = {
                contractId: contractId,
                month: parseInt(month),
                year: parseInt(year),
                amount: amount,
                salaryPercentage: contract.salaryPercentage,
                status: status,
                notes: notes,
                companyId: companies.currentCompany.id,
                userId: auth.currentUser.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (id) {
                const existing = await db.get('certifications', id);
                if (existing) {
                    certification.createdAt = existing.createdAt;
                    await db.update('certifications', id, certification);
                    this.showMessage('Certificación actualizada exitosamente', 'success');
                } else {
                    this.showMessage('Certificación no encontrada', 'error');
                    return;
                }
            } else {
                await db.add('certifications', certification);
                this.showMessage('Certificación creada exitosamente', 'success');
            }
            
            modal.hide();
            await this.loadCertifications();
            
            // Actualizar salarios
            if (window.salary) {
                await salary.updateSalarySummary();
            }
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: companies.currentCompany.id,
                type: id ? 'cert_update' : 'cert_create',
                description: `${id ? 'Actualizada' : 'Creada'} certificación ${month}/${year} por $${amount.toFixed(2)}`
            });
            
        } catch (error) {
            console.error('Error al guardar certificación:', error);
            this.showMessage('Error al guardar la certificación: ' + error.message, 'error');
        }
    }

    async editCertification(id) {
        try {
            const certification = await db.get('certifications', id);
            if (certification) {
                this.showCertificationForm(certification);
            } else {
                this.showMessage('Certificación no encontrada', 'error');
            }
        } catch (error) {
            console.error('Error al cargar certificación:', error);
            this.showMessage('Error al cargar la certificación', 'error');
        }
    }

    async deleteCertification(id) {
        if (!confirm('¿Estás seguro de eliminar esta certificación? También se eliminarán los pagos asociados.')) {
            return;
        }
        
        try {
            // Eliminar pagos asociados
            const payments = await db.getAll('payments', 'certificationId', id);
            for (const payment of payments) {
                await db.delete('payments', payment.id);
            }
            
            // Eliminar certificación
            await db.delete('certifications', id);
            
            this.showMessage('Certificación eliminada exitosamente', 'success');
            await this.loadCertifications();
            
            // Actualizar salarios
            if (window.salary) {
                await salary.updateSalarySummary();
            }
            
            // Registrar actividad
            if (companies?.currentCompany) {
                await db.addActivity({
                    userId: auth.currentUser.id,
                    companyId: companies.currentCompany.id,
                    type: 'cert_delete',
                    description: 'Eliminada certificación'
                });
            }
            
        } catch (error) {
            console.error('Error al eliminar certificación:', error);
            this.showMessage('Error al eliminar la certificación', 'error');
        }
    }

    showMessage(message, type) {
        if (window.auth && auth.showMessage) {
            auth.showMessage(message, type);
        } else {
            alert(message);
        }
    }
}

// Inicializar después de que la base de datos esté lista
let certifications;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    certifications = new Certifications();
    window.certifications = certifications;
});
