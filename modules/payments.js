class Payments {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('add-payment')?.addEventListener('click', () => this.showPaymentForm());
        
        // Escuchar cambios de empresa
        document.addEventListener('companyChanged', () => this.loadPayments());
    }

    async loadPayments() {
        if (!companies?.currentCompany || !auth.currentUser) {
            console.log('No hay empresa seleccionada para cargar pagos');
            return;
        }
        
        try {
            const payments = await db.getAll('payments', 'companyId', companies.currentCompany.id);
            const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', companies.currentCompany.id);
            
            // Enriquecer pagos con datos
            const enrichedPayments = await Promise.all(payments.map(async payment => {
                const contract = contracts.find(c => c.id === payment.contractId);
                const certification = certifications.find(c => c.id === payment.certificationId);
                
                let certificationPeriod = 'N/A';
                let certificationAmount = 0;
                
                if (certification) {
                    certificationPeriod = `${certification.month}/${certification.year}`;
                    certificationAmount = certification.amount || 0;
                } else if (payment.certificationId) {
                    // Si hay ID de certificación pero no se encontró, puede que esté eliminada
                    certificationPeriod = 'Certificación eliminada';
                } else {
                    // Pago sin certificación específica (pago cronológico)
                    certificationPeriod = 'Aplicación automática';
                }
                
                return {
                    ...payment,
                    contractCode: contract?.code || 'N/A',
                    contractClient: contract?.client || 'N/A',
                    certificationPeriod: certificationPeriod,
                    certificationAmount: certificationAmount,
                    paymentDate: payment.date || payment.createdAt.split('T')[0]
                };
            }));
            
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
                <td colspan="7" style="text-align: center; padding: 20px;">
                    No hay pagos registrados. Haz clic en "Nuevo Pago" para agregar uno.
                </td>
            `;
            tbody.appendChild(row);
            return;
        }
        
        // Ordenar por fecha descendente
        payments.sort((a, b) => new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt));
        
        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(payment.paymentDate).toLocaleDateString('es-ES')}</td>
                <td>${payment.contractCode}<br><small>${payment.contractClient}</small></td>
                <td>${payment.certificationPeriod}<br>
                    <small>${payment.certificationAmount > 0 ? `$${payment.certificationAmount.toFixed(2)}` : ''}</small>
                </td>
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
        if (!companies?.currentCompany) {
            this.showMessage('Primero selecciona una empresa', 'error');
            return;
        }
        
        // Obtener contratos activos
        const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
        const activeContracts = contracts.filter(c => c.status === 'activo');
        
        if (activeContracts.length === 0) {
            this.showMessage('No hay contratos activos para realizar pagos', 'error');
            return;
        }
        
        // Crear opciones de contratos
        let contractOptions = '<option value="">Seleccionar contrato (opcional)</option>';
        activeContracts.forEach(contract => {
            contractOptions += `<option value="${contract.id}" ${payment?.contractId === contract.id ? 'selected' : ''}>
                ${contract.code} - ${contract.client}
            </option>`;
        });
        
        const title = payment ? 'Editar Pago' : 'Nuevo Pago de Salario';
        const form = `
            <div class="payment-options">
                <div class="form-group">
                    <label>
                        <input type="radio" name="payment-type" value="specific" id="payment-specific" ${payment?.certificationId ? 'checked' : ''}>
                        Especificar contrato y certificación
                    </label>
                    <label>
                        <input type="radio" name="payment-type" value="automatic" id="payment-automatic" ${!payment?.certificationId ? 'checked' : ''}>
                        Aplicación automática (saldar cronológicamente)
                    </label>
                </div>
            </div>
            
            <div id="specific-payment" style="${payment?.certificationId ? '' : 'display: none;'}">
                <div class="form-group">
                    <label for="payment-contract">Contrato:</label>
                    <select id="payment-contract">
                        ${contractOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="payment-certification">Certificación:</label>
                    <select id="payment-certification">
                        <option value="">Seleccionar certificación</option>
                    </select>
                </div>
            </div>
            
            <div id="automatic-payment" style="${!payment?.certificationId ? '' : 'display: none;'}">
                <div class="form-group">
                    <label for="auto-contract">Contrato (opcional):</label>
                    <select id="auto-contract">
                        <option value="">Aplicar a todos los contratos con saldo pendiente</option>
                        ${activeContracts.map(contract => 
                            `<option value="${contract.id}" ${payment?.contractId === contract.id ? 'selected' : ''}>
                                ${contract.code} - ${contract.client}
                            </option>`
                        ).join('')}
                    </select>
                    <small>Si no se especifica, el pago se aplicará al contrato con la certificación más antigua pendiente</small>
                </div>
            </div>
            
            <div class="form-group">
                <label for="payment-amount">Monto ($) *:</label>
                <input type="number" id="payment-amount" step="0.01" min="0.01" value="${payment?.amount || ''}" required>
            </div>
            <div class="form-group">
                <label for="payment-date">Fecha *:</label>
                <input type="date" id="payment-date" value="${payment?.date || new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label for="payment-method">Método de Pago *:</label>
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
            
            <div id="payment-info" style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 15px; display: none;">
                <h4>Información del Pago:</h4>
                <p id="info-contract"><strong>Contrato:</strong> <span class="info-value">No seleccionado</span></p>
                <p id="info-certification"><strong>Certificación:</strong> <span class="info-value">No seleccionada</span></p>
                <p id="info-salary-due"><strong>Salario generado:</strong> $<span class="info-value">0.00</span></p>
                <p id="info-salary-paid"><strong>Salario pagado:</strong> $<span class="info-value">0.00</span></p>
                <p id="info-salary-pending"><strong>Salario pendiente:</strong> $<span class="info-value">0.00</span></p>
            </div>
            
            <p><small>* Campo obligatorio</small></p>
        `;
        
        modal.show({
            title: title,
            body: form,
            onSave: () => this.savePayment(payment?.id)
        });
        
        // Configurar eventos
        this.setupPaymentFormEvents();
        
        // Si es edición, cargar datos
        if (payment?.contractId) {
            this.loadCertificationsForContract(payment.contractId, payment.certificationId);
        }
    }

    setupPaymentFormEvents() {
        const paymentTypeSpecific = document.getElementById('payment-specific');
        const paymentTypeAutomatic = document.getElementById('payment-automatic');
        const specificDiv = document.getElementById('specific-payment');
        const automaticDiv = document.getElementById('automatic-payment');
        const contractSelect = document.getElementById('payment-contract');
        const autoContractSelect = document.getElementById('auto-contract');
        const infoDiv = document.getElementById('payment-info');
        
        // Cambiar entre tipos de pago
        paymentTypeSpecific?.addEventListener('change', () => {
            if (paymentTypeSpecific.checked) {
                specificDiv.style.display = 'block';
                automaticDiv.style.display = 'none';
            }
        });
        
        paymentTypeAutomatic?.addEventListener('change', () => {
            if (paymentTypeAutomatic.checked) {
                specificDiv.style.display = 'none';
                automaticDiv.style.display = 'block';
            }
        });
        
        // Cargar certificaciones cuando se selecciona un contrato
        contractSelect?.addEventListener('change', async () => {
            const contractId = contractSelect.value;
            if (contractId) {
                await this.loadCertificationsForContract(contractId);
                infoDiv.style.display = 'block';
            } else {
                infoDiv.style.display = 'none';
            }
        });
        
        // Actualizar información para pago automático
        autoContractSelect?.addEventListener('change', async () => {
            const contractId = autoContractSelect.value;
            if (contractId) {
                await this.updateAutoPaymentInfo(contractId);
                infoDiv.style.display = 'block';
            } else {
                await this.updateGeneralPaymentInfo();
                infoDiv.style.display = 'block';
            }
        });
        
        // Inicializar información si hay contrato seleccionado
        if (autoContractSelect.value || contractSelect.value) {
            infoDiv.style.display = 'block';
            if (autoContractSelect.value) {
                this.updateAutoPaymentInfo(autoContractSelect.value);
            } else if (contractSelect.value) {
                this.loadCertificationsForContract(contractSelect.value);
            }
        }
    }

    async loadCertificationsForContract(contractId, selectedCertId = null) {
        const certSelect = document.getElementById('payment-certification');
        const infoDiv = document.getElementById('payment-info');
        
        if (!contractId) {
            certSelect.innerHTML = '<option value="">Seleccionar certificación</option>';
            return;
        }
        
        try {
            const contract = await db.get('contracts', contractId);
            const certifications = await db.getAll('certifications', 'contractId', contractId);
            const payments = await db.getAll('payments', 'contractId', contractId);
            
            // Filtrar certificaciones con salario pendiente
            const pendingCerts = certifications.filter(cert => {
                const certPayments = payments.filter(p => p.certificationId === cert.id);
                const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                const salaryGenerated = cert.amount * (contract.salaryPercentage / 100);
                return totalPaid < salaryGenerated;
            }).sort((a, b) => {
                // Ordenar cronológicamente (más antiguo primero)
                const dateA = new Date(a.year, a.month - 1);
                const dateB = new Date(b.year, b.month - 1);
                return dateA - dateB;
            });
            
            // Actualizar select
            certSelect.innerHTML = '<option value="">Seleccionar certificación</option>';
            pendingCerts.forEach(cert => {
                const salaryGenerated = cert.amount * (contract.salaryPercentage / 100);
                const certPayments = payments.filter(p => p.certificationId === cert.id);
                const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                const pending = salaryGenerated - totalPaid;
                
                const option = document.createElement('option');
                option.value = cert.id;
                option.textContent = `${cert.month}/${cert.year} - Monto: $${cert.amount.toFixed(2)} - Pendiente: $${pending.toFixed(2)}`;
                if (cert.id === selectedCertId) {
                    option.selected = true;
                }
                certSelect.appendChild(option);
            });
            
            // Actualizar información
            this.updatePaymentInfo(contract, pendingCerts, payments);
            
        } catch (error) {
            console.error('Error al cargar certificaciones:', error);
            certSelect.innerHTML = '<option value="">Error al cargar certificaciones</option>';
        }
    }

    async updatePaymentInfo(contract, pendingCerts, payments) {
        document.getElementById('info-contract').innerHTML = `<strong>Contrato:</strong> ${contract.code} - ${contract.client}`;
        
        if (pendingCerts.length > 0) {
            const firstCert = pendingCerts[0];
            const salaryGenerated = firstCert.amount * (contract.salaryPercentage / 100);
            const certPayments = payments.filter(p => p.certificationId === firstCert.id);
            const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
            const pending = salaryGenerated - totalPaid;
            
            document.getElementById('info-certification').innerHTML = 
                `<strong>Certificación:</strong> ${firstCert.month}/${firstCert.year} ($${firstCert.amount.toFixed(2)})`;
            document.getElementById('info-salary-due').innerHTML = 
                `<strong>Salario generado:</strong> $<span class="info-value">${salaryGenerated.toFixed(2)}</span>`;
            document.getElementById('info-salary-paid').innerHTML = 
                `<strong>Salario pagado:</strong> $<span class="info-value">${totalPaid.toFixed(2)}</span>`;
            document.getElementById('info-salary-pending').innerHTML = 
                `<strong>Salario pendiente:</strong> $<span class="info-value">${pending.toFixed(2)}</span>`;
        } else {
            document.getElementById('info-certification').innerHTML = `<strong>Certificación:</strong> No hay certificaciones pendientes`;
            document.getElementById('info-salary-due').innerHTML = `<strong>Salario generado:</strong> $<span class="info-value">0.00</span>`;
            document.getElementById('info-salary-paid').innerHTML = `<strong>Salario pagado:</strong> $<span class="info-value">0.00</span>`;
            document.getElementById('info-salary-pending').innerHTML = `<strong>Salario pendiente:</strong> $<span class="info-value">0.00</span>`;
        }
    }

    async updateAutoPaymentInfo(contractId = null) {
        try {
            let totalPending = 0;
            let oldestCert = null;
            let contractInfo = '';
            
            if (contractId) {
                // Información para un contrato específico
                const contract = await db.get('contracts', contractId);
                const certifications = await db.getAll('certifications', 'contractId', contractId);
                const payments = await db.getAll('payments', 'contractId', contractId);
                
                contractInfo = `${contract.code} - ${contract.client}`;
                
                // Encontrar certificación más antigua pendiente
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
                
                if (pendingCerts.length > 0) {
                    oldestCert = pendingCerts[0];
                    const salaryGenerated = oldestCert.amount * (contract.salaryPercentage / 100);
                    const certPayments = payments.filter(p => p.certificationId === oldestCert.id);
                    const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                    totalPending = salaryGenerated - totalPaid;
                }
                
            } else {
                // Información para todos los contratos
                const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
                contractInfo = 'Todos los contratos';
                
                // Calcular total pendiente y encontrar la certificación más antigua
                for (const contract of contracts) {
                    const certifications = await db.getAll('certifications', 'contractId', contract.id);
                    const payments = await db.getAll('payments', 'contractId', contract.id);
                    
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
                    
                    if (pendingCerts.length > 0) {
                        const firstCert = pendingCerts[0];
                        const salaryGenerated = firstCert.amount * (contract.salaryPercentage / 100);
                        const certPayments = payments.filter(p => p.certificationId === firstCert.id);
                        const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
                        totalPending += (salaryGenerated - totalPaid);
                        
                        // Encontrar la certificación más antigua general
                        if (!oldestCert || new Date(firstCert.year, firstCert.month - 1) < new Date(oldestCert.year, oldestCert.month - 1)) {
                            oldestCert = firstCert;
                        }
                    }
                }
            }
            
            // Actualizar información
            document.getElementById('info-contract').innerHTML = `<strong>Contrato:</strong> ${contractInfo}`;
            
            if (oldestCert) {
                document.getElementById('info-certification').innerHTML = 
                    `<strong>Próxima certificación:</strong> ${oldestCert.month}/${oldestCert.year}`;
            } else {
                document.getElementById('info-certification').innerHTML = `<strong>Certificación:</strong> No hay certificaciones pendientes`;
            }
            
            document.getElementById('info-salary-due').innerHTML = `<strong>Salario pendiente total:</strong> $<span class="info-value">${totalPending.toFixed(2)}</span>`;
            document.getElementById('info-salary-paid').innerHTML = `<strong>Salario pagado:</strong> Información no disponible`;
            document.getElementById('info-salary-pending').innerHTML = `<strong>Monto disponible:</strong> $<span class="info-value">${totalPending.toFixed(2)}</span>`;
            
        } catch (error) {
            console.error('Error al actualizar información:', error);
        }
    }

    async updateGeneralPaymentInfo() {
        await this.updateAutoPaymentInfo(null);
    }

    async savePayment(id = null) {
        const isSpecific = document.getElementById('payment-specific')?.checked;
        const amount = parseFloat(document.getElementById('payment-amount').value);
        const date = document.getElementById('payment-date').value;
        const method = document.getElementById('payment-method').value;
        const notes = document.getElementById('payment-notes').value;
        
        // Validaciones básicas
        if (isNaN(amount) || amount <= 0) {
            this.showMessage('El monto debe ser mayor a 0', 'error');
            return;
        }
        
        if (!date) {
            this.showMessage('La fecha es requerida', 'error');
            return;
        }
        
        try {
            let paymentData = {
                type: 'salary',
                amount: amount,
                date: date,
                method: method,
                notes: notes,
                companyId: companies.currentCompany.id,
                userId: auth.currentUser.id,
                createdAt: new Date().toISOString()
            };
            
            if (isSpecific) {
                // Pago específico
                const contractId = document.getElementById('payment-contract').value;
                const certificationId = document.getElementById('payment-certification').value;
                
                if (!contractId || !certificationId) {
                    this.showMessage('Para pago específico, selecciona contrato y certificación', 'error');
                    return;
                }
                
                // Verificar que el pago no exceda el salario pendiente
                const certification = await db.get('certifications', certificationId);
                const contract = await db.get('contracts', contractId);
                
                if (!certification || !contract) {
                    this.showMessage('Certificación o contrato no encontrado', 'error');
                    return;
                }
                
                const existingPayments = await db.getAll('payments', 'certificationId', certificationId);
                const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
                const salaryGenerated = certification.amount * (contract.salaryPercentage / 100);
                const remaining = salaryGenerated - totalPaid;
                
                if (amount > remaining) {
                    this.showMessage(`El monto excede el salario pendiente ($${remaining.toFixed(2)})`, 'error');
                    return;
                }
                
                paymentData.contractId = contractId;
                paymentData.certificationId = certificationId;
                
            } else {
                // Pago automático (cronológico)
                const autoContractId = document.getElementById('auto-contract').value;
                
                if (autoContractId) {
                    // Pago a contrato específico
                    await this.applyAutomaticPayment(paymentData, autoContractId, amount);
                } else {
                    // Pago a todos los contratos
                    await this.applyAutomaticPaymentToAll(paymentData, amount);
                }
                
                // No continuar aquí, el método anterior maneja todo
                return;
            }
            
            // Guardar pago específico
            if (id) {
                const existing = await db.get('payments', id);
                if (existing) {
                    paymentData.createdAt = existing.createdAt;
                    await db.update('payments', id, paymentData);
                    this.showMessage('Pago actualizado exitosamente', 'success');
                }
            } else {
                await db.add('payments', paymentData);
                this.showMessage('Pago registrado exitosamente', 'success');
            }
            
            modal.hide();
            await this.loadPayments();
            
            // Actualizar salarios
            if (window.salary) {
                await salary.updateSalarySummary();
            }
            
            // Actualizar estado de certificación si se pagó completamente
            if (paymentData.certificationId) {
                await this.updateCertificationStatus(paymentData.certificationId);
            }
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: companies.currentCompany.id,
                type: id ? 'payment_update' : 'payment_create',
                description: `${id ? 'Actualizado' : 'Registrado'} pago de salario por $${amount.toFixed(2)}`
            });
            
        } catch (error) {
            console.error('Error al guardar pago:', error);
            this.showMessage('Error al guardar el pago: ' + error.message, 'error');
        }
    }

    async applyAutomaticPayment(paymentData, contractId, amount) {
        let remainingAmount = amount;
        
        // Obtener certificaciones pendientes ordenadas cronológicamente
        const certifications = await db.getAll('certifications', 'contractId', contractId);
        const contract = await db.get('contracts', contractId);
        const payments = await db.getAll('payments', 'contractId', contractId);
        
        // Filtrar y ordenar certificaciones pendientes
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
        
        // Aplicar pago a las certificaciones en orden
        for (const cert of pendingCerts) {
            if (remainingAmount <= 0) break;
            
            const certPayments = payments.filter(p => p.certificationId === cert.id);
            const totalPaid = certPayments.reduce((sum, p) => sum + p.amount, 0);
            const salaryGenerated = cert.amount * (contract.salaryPercentage / 100);
            const certRemaining = salaryGenerated - totalPaid;
            
            if (certRemaining > 0) {
                const paymentForThisCert = Math.min(remainingAmount, certRemaining);
                
                // Crear pago para esta certificación
                const specificPayment = {
                    ...paymentData,
                    contractId: contractId,
                    certificationId: cert.id,
                    amount: paymentForThisCert,
                    notes: `${paymentData.notes || ''} ${paymentData.notes ? '| ' : ''}Pago automático aplicado a certificación ${cert.month}/${cert.year}`.trim()
                };
                
                await db.add('payments', specificPayment);
                
                remainingAmount -= paymentForThisCert;
                
                // Actualizar estado de certificación si se pagó completamente
                if (paymentForThisCert >= certRemaining - 0.01) { // Tolerancia pequeña para decimales
                    await this.updateCertificationStatus(cert.id);
                }
            }
        }
        
        if (remainingAmount > 0) {
            this.showMessage(`Pago aplicado. Quedaron $${remainingAmount.toFixed(2)} sin aplicar (no hay más salario pendiente)`, 'warning');
        } else {
            this.showMessage('Pago aplicado exitosamente a las certificaciones pendientes', 'success');
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
            companyId: companies.currentCompany.id,
            type: 'payment_create',
            description: `Pago automático de salario por $${amount.toFixed(2)} aplicado cronológicamente`
        });
    }

    async applyAutomaticPaymentToAll(paymentData, amount) {
        let remainingAmount = amount;
        
        // Obtener todos los contratos
        const contracts = await db.getAll('contracts', 'companyId', companies.currentCompany.id);
        
        // Para cada contrato, obtener certificaciones pendientes ordenadas
        const allPendingCerts = [];
        
        for (const contract of contracts) {
            const certifications = await db.getAll('certifications', 'contractId', contract.id);
            const payments = await db.getAll('payments', 'contractId', contract.id);
            
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
            
            // Agregar con información del contrato
            pendingCerts.forEach(cert => {
                allPendingCerts.push({
                    ...cert,
                    contractId: contract.id,
                    contract: contract,
                    contractPayments: payments.filter(p => p.certificationId === cert.id)
                });
            });
        }
        
        // Ordenar todas las certificaciones por fecha (más antiguas primero)
        allPendingCerts.sort((a, b) => {
            const dateA = new Date(a.year, a.month - 1);
            const dateB = new Date(b.year, b.month - 1);
            return dateA - dateB;
        });
        
        if (allPendingCerts.length === 0) {
            this.showMessage('No hay salario pendiente en ningún contrato', 'error');
            return;
        }
        
        // Aplicar pago en orden cronológico
        for (const certInfo of allPendingCerts) {
            if (remainingAmount <= 0) break;
            
            const totalPaid = certInfo.contractPayments.reduce((sum, p) => sum + p.amount, 0);
            const salaryGenerated = certInfo.amount * (certInfo.contract.salaryPercentage / 100);
            const certRemaining = salaryGenerated - totalPaid;
            
            if (certRemaining > 0) {
                const paymentForThisCert = Math.min(remainingAmount, certRemaining);
                
                // Crear pago para esta certificación
                const specificPayment = {
                    ...paymentData,
                    contractId: certInfo.contractId,
                    certificationId: certInfo.id,
                    amount: paymentForThisCert,
                    notes: `${paymentData.notes || ''} ${paymentData.notes ? '| ' : ''}Pago automático aplicado cronológicamente a ${certInfo.contract.code} - ${certInfo.month}/${certInfo.year}`.trim()
                };
                
                await db.add('payments', specificPayment);
                
                remainingAmount -= paymentForThisCert;
                
                // Actualizar estado de certificación si se pagó completamente
                if (paymentForThisCert >= certRemaining - 0.01) {
                    await this.updateCertificationStatus(certInfo.id);
                }
            }
        }
        
        if (remainingAmount > 0) {
            this.showMessage(`Pago aplicado. Quedaron $${remainingAmount.toFixed(2)} sin aplicar (no hay más salario pendiente)`, 'warning');
        } else {
            this.showMessage('Pago aplicado exitosamente a todas las certificaciones pendientes en orden cronológico', 'success');
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
            companyId: companies.currentCompany.id,
            type: 'payment_create',
            description: `Pago automático de salario por $${amount.toFixed(2)} aplicado a todos los contratos cronológicamente`
        });
    }

    async updateCertificationStatus(certificationId) {
        try {
            const certification = await db.get('certifications', certificationId);
            if (!certification) return;
            
            const payments = await db.getAll('payments', 'certificationId', certificationId);
            const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
            const contract = await db.get('contracts', certification.contractId);
            const salaryGenerated = certification.amount * (contract.salaryPercentage / 100);
            
            // Si el salario pagado es igual o mayor al generado (con pequeña tolerancia)
            if (Math.abs(totalPaid - salaryGenerated) < 0.01 || totalPaid > salaryGenerated) {
                await db.update('certifications', certificationId, {
                    ...certification,
                    status: 'pagado',
                    updatedAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error al actualizar estado de certificación:', error);
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
            
            // Actualizar estados de certificaciones
            const payment = await db.get('payments', id);
            if (payment?.certificationId) {
                await this.updateCertificationStatus(payment.certificationId);
            }
            
            // Registrar actividad
            if (companies?.currentCompany) {
                await db.addActivity({
                    userId: auth.currentUser.id,
                    companyId: companies.currentCompany.id,
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
