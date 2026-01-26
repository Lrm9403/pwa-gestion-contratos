class Payments {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('add-payment')?.addEventListener('click', () => this.showPaymentForm());
    }

    async loadPayments() {
        if (!contracts?.currentCompany || !auth.currentUser) {
            console.log('No hay empresa seleccionada para cargar pagos');
            return;
        }
        
        try {
            const payments = await db.getAll('payments', 'companyId', contracts.currentCompany.id);
            const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
            const certificationsList = await db.getAll('certifications', 'companyId', contracts.currentCompany.id);
            
            // Enriquecer pagos con datos
            const enrichedPayments = payments.map(payment => {
                const certification = certificationsList.find(c => c.id === payment.certificationId);
                const contract = contractsList.find(c => c.id === payment.contractId);
                
                return {
                    ...payment,
                    contractCode: contract?.code || 'N/A',
                    contractClient: contract?.client || 'N/A',
                    certificationPeriod: certification ? `${certification.month}/${certification.year}` : 'N/A',
                    certificationAmount: certification?.amount || 0
                };
            });
            
            this.renderPayments(enrichedPayments);
        } catch (error) {
            console.error('Error al cargar pagos:', error);
            this.showMessage('Error al cargar pagos', 'error');
        }
    }

    renderPayments(payments) {
        const tbody = document.getElementById('payments-list');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (payments.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="6" style="text-align: center; padding: 20px;">
                    No hay pagos registrados. Haz clic en "Nuevo Pago" para agregar uno.
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        // Ordenar por fecha descendente
        payments.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
        
        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${payment.date ? new Date(payment.date).toLocaleDateString('es-ES') : 
                    new Date(payment.createdAt).toLocaleDateString('es-ES')}</td>
                <td>${payment.contractCode} - ${payment.contractClient}</td>
                <td>${payment.certificationPeriod} ($${payment.certificationAmount?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00'})</td>
                <td>$${payment.amount?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00'}</td>
                <td>${this.getMethodLabel(payment.method)}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="payments.deletePayment('${payment.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getMethodLabel(method) {
        const methods = {
            'transferencia': 'Transferencia',
            'efectivo': 'Efectivo',
            'cheque': 'Cheque',
            'tarjeta': 'Tarjeta',
            'otros': 'Otros'
        };
        return methods[method] || method;
    }

    async showPaymentForm(payment = null) {
        if (!contracts?.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }
        
        // Obtener contratos activos
        const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
        const activeContracts = contractsList.filter(c => c.status === 'activo');
        
        if (activeContracts.length === 0) {
            this.showMessage('No hay contratos activos para realizar pagos', 'error');
            return;
        }
        
        // Crear opciones de contratos
        let contractOptions = '<option value="">Seleccionar contrato</option>';
        activeContracts.forEach(contract => {
            contractOptions += `<option value="${contract.id}" ${payment?.contractId === contract.id ? 'selected' : ''}>
                ${contract.code} - ${contract.client} (${contract.salaryPercentage}%)
            </option>`;
        });
        
        const title = payment ? 'Editar Pago' : 'Nuevo Pago de Salario';
        const form = `
            <div class="form-group">
                <label for="payment-contract">Contrato:</label>
                <select id="payment-contract" required>
                    ${contractOptions}
                </select>
                <small>Selecciona el contrato al que pertenece el pago</small>
            </div>
            <div class="form-group">
                <label for="payment-certification">Certificación (opcional):</label>
                <select id="payment-certification">
                    <option value="">Seleccionar certificación específica</option>
                </select>
                <small>Si se deja vacío, se aplicará a la certificación más antigua pendiente</small>
            </div>
            <div class="form-group">
                <label for="payment-amount">Monto ($):</label>
                <input type="number" id="payment-amount" step="0.01" min="0.01" value="${payment?.amount || ''}" required>
            </div>
            <div class="form-group">
                <label for="payment-date">Fecha:</label>
                <input type="date" id="payment-date" value="${payment?.date || new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label for="payment-method">Método de Pago:</label>
                <select id="payment-method" required>
                    <option value="transferencia" ${payment?.method === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                    <option value="efectivo" ${payment?.method === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                    <option value="cheque" ${payment?.method === 'cheque' ? 'selected' : ''}>Cheque</option>
                    <option value="tarjeta" ${payment?.method === 'tarjeta' ? 'selected' : ''}>Tarjeta</option>
                    <option value="otros" ${payment?.method === 'otros' ? 'selected' : ''}>Otros</option>
                </select>
            </div>
            <div class="form-group">
                <label for="payment-notes">Notas (opcional):</label>
                <textarea id="payment-notes" rows="3">${payment?.notes || ''}</textarea>
            </div>
            <div id="certification-info" style="display: none;">
                <h4>Información de la Certificación</h4>
                <p id="cert-details"></p>
                <p id="salary-due"></p>
                <p id="salary-paid"></p>
                <p id="salary-pending"></p>
            </div>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.savePayment(payment?.id)
        });
        
        // Configurar eventos
        const contractSelect = document.getElementById('payment-contract');
        const certSelect = document.getElementById('payment-certification');
        
        contractSelect.addEventListener('change', () => this.loadCertificationsForContract(contractSelect.value));
        
        // Si es edición, cargar certificaciones
        if (payment?.contractId) {
            this.loadCertificationsForContract(payment.contractId, payment.certificationId);
        }
    }

    async loadCertificationsForContract(contractId, selectedCertId = null) {
        const certSelect = document.getElementById('payment-certification');
        const infoDiv = document.getElementById('certification-info');
        const certDetails = document.getElementById('cert-details');
        const salaryDue = document.getElementById('salary-due');
        const salaryPaid = document.getElementById('salary-paid');
        const salaryPending = document.getElementById('salary-pending');
        
        if (!contractId) {
            certSelect.innerHTML = '<option value="">Seleccionar certificación específica</option>';
            infoDiv.style.display = 'none';
            return;
        }
        
        try {
            const certifications = await db.getAll('certifications', 'contractId', contractId);
            const contract = await db.get('contracts', contractId);
            const payments = await db.getAll('payments', 'contractId', contractId);
            
            // Filtrar certificaciones con salario pendiente
            const pendingCerts = certifications.filter(cert => {
                const certPayments = payments.filter(p => p.certificationId === cert.id);
                const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                const salaryGenerated = cert.amount * (contract.salaryPercentage / 100);
                return totalPaid < salaryGenerated;
            }).sort((a, b) => {
                // Ordenar cronológicamente
                const dateA = new Date(a.year, a.month - 1);
                const dateB = new Date(b.year, b.month - 1);
                return dateA - dateB;
            });
            
            // Actualizar select
            certSelect.innerHTML = '<option value="">Seleccionar certificación específica</option>';
            pendingCerts.forEach(cert => {
                const salaryGenerated = cert.amount * (contract.salaryPercentage / 100);
                const certPayments = payments.filter(p => p.certificationId === cert.id);
                const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                const pending = salaryGenerated - totalPaid;
                
                const option = document.createElement('option');
                option.value = cert.id;
                option.textContent = `${cert.month}/${cert.year} - Monto: $${cert.amount.toFixed(2)} - Salario: $${salaryGenerated.toFixed(2)} - Pendiente: $${pending.toFixed(2)}`;
                if (cert.id === selectedCertId) {
                    option.selected = true;
                }
                certSelect.appendChild(option);
            });
            
            // Mostrar información si hay certificaciones
            if (pendingCerts.length > 0 && !selectedCertId) {
                const firstCert = pendingCerts[0];
                const salaryGenerated = firstCert.amount * (contract.salaryPercentage / 100);
                const certPayments = payments.filter(p => p.certificationId === firstCert.id);
                const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                const pending = salaryGenerated - totalPaid;
                
                certDetails.textContent = `Certificación ${firstCert.month}/${firstCert.year} - Monto: $${firstCert.amount.toFixed(2)}`;
                salaryDue.textContent = `Salario generado: $${salaryGenerated.toFixed(2)}`;
                salaryPaid.textContent = `Salario pagado: $${totalPaid.toFixed(2)}`;
                salaryPending.textContent = `Salario pendiente: $${pending.toFixed(2)}`;
                infoDiv.style.display = 'block';
                
                // Establecer monto sugerido
                const amountInput = document.getElementById('payment-amount');
                if (amountInput && !amountInput.value) {
                    amountInput.value = pending.toFixed(2);
                }
            } else {
                infoDiv.style.display = 'none';
            }
            
        } catch (error) {
            console.error('Error al cargar certificaciones:', error);
            certSelect.innerHTML = '<option value="">Error al cargar certificaciones</option>';
            infoDiv.style.display = 'none';
        }
    }

    async savePayment(id = null) {
        const contractId = document.getElementById('payment-contract').value;
        const certificationId = document.getElementById('payment-certification').value || null;
        const amount = parseFloat(document.getElementById('payment-amount').value);
        const date = document.getElementById('payment-date').value;
        const method = document.getElementById('payment-method').value;
        const notes = document.getElementById('payment-notes').value;
        
        // Validaciones
        if (!contractId) {
            this.showMessage('Selecciona un contrato', 'error');
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            this.showMessage('El monto debe ser mayor a 0', 'error');
            return;
        }
        
        if (!date) {
            this.showMessage('La fecha es requerida', 'error');
            return;
        }
        
        try {
            const contract = await db.get('contracts', contractId);
            if (!contract) {
                this.showMessage('Contrato no encontrado', 'error');
                return;
            }
            
            let targetCertificationId = certificationId;
            
            // Si no se especificó certificación, usar la más antigua pendiente
            if (!targetCertificationId) {
                const certifications = await db.getAll('certifications', 'contractId', contractId);
                const payments = await db.getAll('payments', 'contractId', contractId);
                
                const pendingCerts = certifications.filter(cert => {
                    const certPayments = payments.filter(p => p.certificationId === cert.id);
                    const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                    const salaryGenerated = cert.amount * (contract.salaryPercentage / 100);
                    return totalPaid < salaryGenerated;
                }).sort((a, b) => {
                    const dateA = new Date(a.year, a.month - 1);
                    const dateB = new Date(b.year, b.month - 1);
                    return dateA - dateB;
                });
                
                if (pendingCerts.length === 0) {
                    this.showMessage('No hay salario pendiente para este contrato', 'error');
                    return;
                }
                
                targetCertificationId = pendingCerts[0].id;
            }
            
            // Verificar que el pago no exceda el salario pendiente
            if (targetCertificationId) {
                const certification = await db.get('certifications', targetCertificationId);
                const existingPayments = await db.getAll('payments', 'certificationId', targetCertificationId);
                const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
                const salaryGenerated = certification.amount * (contract.salaryPercentage / 100);
                const remaining = salaryGenerated - totalPaid;
                
                if (amount > remaining) {
                    this.showMessage(`El monto excede el salario pendiente ($${remaining.toFixed(2)})`, 'error');
                    return;
                }
            }
            
            const payment = {
                contractId: contractId,
                certificationId: targetCertificationId,
                type: 'salary',
                amount: amount,
                date: date,
                method: method,
                notes: notes,
                companyId: contracts.currentCompany.id,
                userId: auth.currentUser.id,
                createdAt: new Date().toISOString()
            };
            
            if (id) {
                const existingPayment = await db.get('payments', id);
                if (existingPayment) {
                    payment.createdAt = existingPayment.createdAt;
                    await db.update('payments', id, payment);
                    this.showMessage('Pago actualizado exitosamente', 'success');
                }
            } else {
                await db.add('payments', payment);
                this.showMessage('Pago registrado exitosamente', 'success');
            }
            
            modal.hide();
            await this.loadPayments();
            
            // Actualizar salarios
            if (window.salary) {
                await salary.updateSalarySummary();
            }
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: contracts.currentCompany.id,
                type: id ? 'payment_update' : 'payment_create',
                description: `${id ? 'Actualizado' : 'Registrado'} pago de salario por $${amount.toFixed(2)}`
            });
            
        } catch (error) {
            console.error('Error al guardar pago:', error);
            this.showMessage('Error al guardar el pago: ' + error.message, 'error');
        }
    }

    async deletePayment(id) {
        if (!confirm('¿Estás seguro de eliminar este pago?')) {
            return;
        }
        
        try {
            await db.delete('payments', id);
            this.showMessage('Pago eliminado exitosamente', 'success');
            await this.loadPayments();
            
            // Actualizar salarios
            if (window.salary) {
                await salary.updateSalarySummary();
            }
            
            // Registrar actividad
            if (contracts?.currentCompany) {
                await db.addActivity({
                    userId: auth.currentUser.id,
                    companyId: contracts.currentCompany.id,
                    type: 'payment_delete',
                    description: 'Eliminado pago de salario'
                });
            }
            
        } catch (error) {
            console.error('Error al eliminar pago:', error);
            this.showMessage('Error al eliminar el pago', 'error');
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
let payments;
document.addEventListener('DOMContentLoaded', async () => {
    await db.ready();
    payments = new Payments();
    window.payments = payments;
});
