class Salary {
    constructor() {
        this.init();
    }

    init() {
        // Event listeners para pagos de salario
        document.addEventListener('paymentAdded', () => this.updateSalarySummary());
        document.addEventListener('certificationAdded', () => this.updateSalarySummary());
    }

    async updateSalarySummary() {
        if (!contracts.currentCompany || !auth.currentUser) return;
        
        try {
            const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', contracts.currentCompany.id);
            const payments = await db.getAll('payments', 'companyId', contracts.currentCompany.id);
            
            let totalSalaryGenerated = 0;
            let totalSalaryPaid = 0;
            const salaryByContract = [];
            
            // Calcular salario por contrato
            for (const contract of contractsList) {
                const contractCerts = certifications.filter(c => c.contractId === contract.id);
                const contractSalary = contractCerts.reduce((sum, cert) => {
                    return sum + (cert.amount * (contract.salaryPercentage / 100));
                }, 0);
                
                const contractPayments = payments.filter(p => {
                    const cert = certifications.find(c => c.id === p.certificationId);
                    return cert && cert.contractId === contract.id;
                });
                
                const paidSalary = contractPayments.reduce((sum, payment) => {
                    if (payment.type === 'salary') {
                        return sum + payment.amount;
                    }
                    return sum;
                }, 0);
                
                totalSalaryGenerated += contractSalary;
                totalSalaryPaid += paidSalary;
                
                salaryByContract.push({
                    contract,
                    generated: contractSalary,
                    paid: paidSalary,
                    pending: contractSalary - paidSalary
                });
            }
            
            this.renderSalarySummary(totalSalaryGenerated, totalSalaryPaid);
            this.renderSalaryDetails(salaryByContract);
            
            // Actualizar dashboard
            document.getElementById('total-salary-due').textContent = 
                `$${(totalSalaryGenerated - totalSalaryPaid).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
            document.getElementById('total-salary-paid').textContent = 
                `$${totalSalaryPaid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
            
        } catch (error) {
            console.error('Error al calcular salarios:', error);
        }
    }

    renderSalarySummary(generated, paid) {
        const pending = generated - paid;
        
        document.getElementById('total-salary-due').textContent = 
            `$${pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        document.getElementById('total-salary-paid').textContent = 
            `$${paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
    }

    renderSalaryDetails(salaryData) {
        const tbody = document.getElementById('salary-list');
        tbody.innerHTML = '';
        
        salaryData.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.contract.code} - ${item.contract.client}</td>
                <td>$${item.generated.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>$${item.paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>$${item.pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="salary.paySalary('${item.contract.id}')" 
                            ${item.pending <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-money-bill-wave"></i> Pagar
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async paySalary(contractId) {
        try {
            const contract = await db.get('contracts', contractId);
            const certifications = await db.getAll('certifications', 'contractId', contractId);
            const payments = await db.getAll('payments', 'companyId', contracts.currentCompany.id);
            
            // Encontrar certificaciones con salario pendiente
            const pendingCerts = certifications.filter(cert => {
                const certPayments = payments.filter(p => p.certificationId === cert.id && p.type === 'salary');
                const paidAmount = certPayments.reduce((sum, p) => sum + p.amount, 0);
                const salaryDue = cert.amount * (contract.salaryPercentage / 100);
                return salaryDue > paidAmount;
            }).sort((a, b) => {
                // Ordenar cronológicamente
                const dateA = new Date(a.year, a.month - 1);
                const dateB = new Date(b.year, b.month - 1);
                return dateA - dateB;
            });
            
            if (pendingCerts.length === 0) {
                auth.showMessage('No hay salario pendiente para este contrato', 'info');
                return;
            }
            
            const firstPending = pendingCerts[0];
            const salaryDue = firstPending.amount * (contract.salaryPercentage / 100);
            const certPayments = payments.filter(p => p.certificationId === firstPending.id && p.type === 'salary');
            const paidAmount = certPayments.reduce((sum, p) => sum + p.amount, 0);
            const remainingDue = salaryDue - paidAmount;
            
            // Mostrar formulario de pago
            const form = `
                <div class="form-group">
                    <label>Contrato:</label>
                    <p><strong>${contract.code} - ${contract.client}</strong></p>
                </div>
                <div class="form-group">
                    <label>Certificación:</label>
                    <p>${firstPending.month}/${firstPending.year} - $${firstPending.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="form-group">
                    <label>Salario Generado:</label>
                    <p>$${salaryDue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="form-group">
                    <label>Salario Ya Pagado:</label>
                    <p>$${paidAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="form-group">
                    <label>Salario Pendiente:</label>
                    <p>$${remainingDue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="form-group">
                    <label for="salary-amount">Monto a Pagar ($):</label>
                    <input type="number" id="salary-amount" step="0.01" max="${remainingDue}" value="${remainingDue}" required>
                </div>
                <div class="form-group">
                    <label for="payment-method">Método de Pago:</label>
                    <select id="payment-method">
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="cheque">Cheque</option>
                        <option value="tarjeta">Tarjeta</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="payment-date">Fecha:</label>
                    <input type="date" id="payment-date" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label for="payment-notes">Notas:</label>
                    <textarea id="payment-notes" rows="3"></textarea>
                </div>
            `;
            
            modal.show({
                title: 'Pagar Salario',
                body: form,
                onSave: () => this.processSalaryPayment(contract, firstPending, remainingDue)
            });
            
        } catch (error) {
            console.error('Error al procesar pago de salario:', error);
            auth.showMessage('Error al procesar el pago', 'error');
        }
    }

    async processSalaryPayment(contract, certification, remainingDue) {
        const amount = parseFloat(document.getElementById('salary-amount').value);
        
        if (isNaN(amount) || amount <= 0 || amount > remainingDue) {
            auth.showMessage('Monto inválido', 'error');
            return;
        }
        
        try {
            const payment = {
                certificationId: certification.id,
                contractId: contract.id,
                type: 'salary',
                amount: amount,
                method: document.getElementById('payment-method').value,
                date: document.getElementById('payment-date').value || new Date().toISOString().split('T')[0],
                notes: document.getElementById('payment-notes').value,
                companyId: contracts.currentCompany.id,
                userId: auth.currentUser.id,
                createdAt: new Date().toISOString()
            };
            
            await db.add('payments', payment);
            
            // Actualizar estado de certificación si se pagó completamente
            const payments = await db.getAll('payments', 'certificationId', certification.id);
            const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
            const salaryDue = certification.amount * (contract.salaryPercentage / 100);
            
            if (Math.abs(totalPaid - salaryDue) < 0.01) {
                await db.update('certifications', certification.id, {
                    ...certification,
                    status: 'pagado'
                });
            }
            
            modal.hide();
            auth.showMessage('Pago registrado exitosamente', 'success');
            
            // Disparar evento para actualizar otras partes de la app
            document.dispatchEvent(new CustomEvent('paymentAdded'));
            
            // Registrar actividad
            await db.addActivity({
                userId: auth.currentUser.id,
                companyId: contracts.currentCompany.id,
                type: 'salary_payment',
                description: `Pago de salario por $${amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
            });
            
        } catch (error) {
            console.error('Error al registrar pago:', error);
            auth.showMessage('Error al registrar el pago', 'error');
        }
    }
}

const salary = new Salary();
