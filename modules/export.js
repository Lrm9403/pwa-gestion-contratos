class ExportManager {
    constructor() {
        this.utils = window.contractAppUtils;
        this.init();
    }

    init() {
        document.getElementById('export-excel')?.addEventListener('click', () => this.exportToExcel());
        document.getElementById('export-pdf')?.addEventListener('click', () => this.exportToPDF());
    }

    getSalaryPaidMap(paymentsList) {
        const map = new Map();
        paymentsList.filter(payment => payment.purpose === 'salary').forEach(payment => {
            (payment.allocations || []).forEach(allocation => {
                if (!allocation.certificationId) return;
                map.set(allocation.certificationId, this.utils.roundMoney((map.get(allocation.certificationId) || 0) + this.utils.toNumber(allocation.amount)));
            });
        });
        return map;
    }

    getInvoicePaidMap(paymentsList) {
        const map = new Map();
        paymentsList.filter(payment => payment.purpose === 'invoice').forEach(payment => {
            (payment.allocations || []).forEach(allocation => {
                if (!allocation.invoiceId) return;
                map.set(allocation.invoiceId, this.utils.roundMoney((map.get(allocation.invoiceId) || 0) + this.utils.toNumber(allocation.amount)));
            });
        });
        return map;
    }

    getContractSummary(contract, companyTax) {
        const baseServiceValue = this.utils.toNumber(contract.serviceValue);
        const supplements = Array.isArray(contract.supplements) ? contract.supplements : [];
        const supplementsValue = this.utils.roundMoney(
            supplements.reduce((sum, supplement) => sum + this.utils.toNumber(supplement.amount), 0)
        );
        const serviceValue = this.utils.roundMoney(baseServiceValue + supplementsValue);
        return {
            baseServiceValue,
            supplementsValue,
            serviceValue,
            totalWithTax: this.utils.calculateTotalWithTax(serviceValue, companyTax)
        };
    }

    getInvoiceStatus(invoice, paidAmount) {
        if ((invoice.manualStatus || invoice.status) === 'pagado') return 'pagado';
        if (paidAmount <= 0) return 'por_pagar';
        if (paidAmount >= this.utils.toNumber(invoice.amount)) return 'pagado';
        return 'parcial';
    }

    async exportToExcel() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            auth.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        try {
            const [contractsList, certificationsList, invoicesList, paymentsList] = await Promise.all([
                db.getAll('contracts', 'companyId', companies.currentCompany.id),
                db.getAll('certifications', 'companyId', companies.currentCompany.id),
                db.getAll('invoices', 'companyId', companies.currentCompany.id),
                db.getAll('payments', 'companyId', companies.currentCompany.id)
            ]);

            const salaryPaidMap = this.getSalaryPaidMap(paymentsList);
            const invoicePaidMap = this.getInvoicePaidMap(paymentsList);
            const wb = XLSX.utils.book_new();
            const companyTax = this.utils.getCompanyTaxPercentage(companies.currentCompany);

            const contractsData = contractsList.map(contract => {
                const summary = this.getContractSummary(contract, companyTax);
                return ({
                'Código': contract.code,
                'Nombre': contract.name || '',
                'Cliente': contract.client,
                'Valor Base Servicio': summary.baseServiceValue,
                'Valor Suplementos': summary.supplementsValue,
                'Valor Servicio': summary.serviceValue,
                '% Impuestos': companyTax,
                'Valor Total (+% impuestos)': summary.totalWithTax,
                '% Salario': contract.salaryPercentage,
                'Fecha Inicio': contract.startDate,
                'Fecha Fin': contract.endDate,
                'Estado': contract.status
            })});
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contractsData), 'Contratos');

            const supplementsData = contractsList.flatMap(contract => {
                const supplements = Array.isArray(contract.supplements) ? contract.supplements : [];
                if (supplements.length === 0) return [];
                return supplements.map(supplement => ({
                    'Contrato': contract.code,
                    'Nombre Contrato': contract.name || '',
                    'Fecha': supplement.date || '',
                    'Monto': this.utils.toNumber(supplement.amount),
                    'Descripción': supplement.description || ''
                }));
            });
            if (supplementsData.length > 0) {
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supplementsData), 'Suplementos');
            }

            const certificationsData = certificationsList.map(certification => {
                const contract = contractsList.find(item => item.id === certification.contractId);
                const salaryGenerated = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                const salaryPaid = salaryPaidMap.get(certification.id) || 0;
                return {
                    'Contrato': contract?.code || 'N/A',
                    'Cliente': contract?.client || 'N/A',
                    'Mes/Año': this.utils.getCertificationPeriodLabel(certification),
                    'Monto Certificado': certification.amount,
                    'Monto Certificado + Impuestos': this.utils.calculateTotalWithTax(certification.amount, companyTax),
                    'Salario Generado': salaryGenerated,
                    'Salario Pagado': salaryPaid,
                    'Salario Pendiente': this.utils.roundMoney(Math.max(0, salaryGenerated - salaryPaid)),
                    'Estado': certification.status || 'pendiente'
                };
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(certificationsData), 'Certificaciones');

            const invoicesData = invoicesList.map(invoice => {
                const contract = contractsList.find(item => item.id === invoice.contractId);
                const paid = invoicePaidMap.get(invoice.id) || 0;
                return {
                    'Número': invoice.number,
                    'Contrato': contract?.code || 'N/A',
                    'Fecha': invoice.date,
                    'Vencimiento': invoice.dueDate || '',
                    'Monto': invoice.amount,
                    'Pagado': paid,
                    'Pendiente': this.utils.roundMoney(Math.max(0, this.utils.toNumber(invoice.amount) - paid)),
                    'Estado': this.getInvoiceStatus(invoice, paid)
                };
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoicesData), 'Facturas');

            const paymentsData = paymentsList.map(payment => ({
                'Fecha': payment.date,
                'Tipo': payment.purpose === 'invoice' ? 'Factura' : 'Salario',
                'Monto Registrado': payment.amount,
                'Monto Aplicado': payment.appliedAmount || payment.amount,
                'Método': payment.method,
                'Aplicación': (payment.allocations || []).map(allocation => {
                    if (payment.purpose === 'salary') {
                        const certification = certificationsList.find(item => item.id === allocation.certificationId);
                        return `Certificación ${certification ? this.utils.getCertificationPeriodLabel(certification) : 'N/A'}: ${allocation.amount}`;
                    }
                    const invoice = invoicesList.find(item => item.id === allocation.invoiceId);
                    return `Factura ${invoice?.number || 'N/A'}: ${allocation.amount}`;
                }).join(' | '),
                'Notas': payment.notes || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentsData), 'Pagos');

            const salaryGeneratedTotal = certificationsList.reduce((sum, certification) => {
                const contract = contractsList.find(item => item.id === certification.contractId);
                return sum + this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
            }, 0);
            const salaryPaidTotal = Array.from(salaryPaidMap.values()).reduce((sum, value) => sum + value, 0);
            const invoicesTotal = invoicesList.reduce((sum, invoice) => sum + this.utils.toNumber(invoice.amount), 0);
            const invoicesPaidTotal = Array.from(invoicePaidMap.values()).reduce((sum, value) => sum + value, 0);
            const summaryData = [{
                'Empresa': companies.currentCompany.name,
                'Fecha Exportación': new Date().toISOString().split('T')[0],
                'Contratos': contractsList.length,
                'Certificaciones': certificationsList.length,
                'Facturas': invoicesList.length,
                'Pagos': paymentsList.length,
                'Salario Generado': this.utils.roundMoney(salaryGeneratedTotal),
                'Salario Pagado': this.utils.roundMoney(salaryPaidTotal),
                'Salario Pendiente': this.utils.roundMoney(Math.max(0, salaryGeneratedTotal - salaryPaidTotal)),
                'Facturación Total': this.utils.roundMoney(invoicesTotal),
                'Facturación Pagada': this.utils.roundMoney(invoicesPaidTotal)
            }];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Resumen');

            XLSX.writeFile(wb, `${companies.currentCompany.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
            auth.showMessage('Exportación completada', 'success');
        } catch (error) {
            console.error('Error al exportar a Excel:', error);
            auth.showMessage('Error al exportar a Excel', 'error');
        }
    }

    async exportToPDF() {
        if (!companies?.currentCompany || !auth?.currentUser) {
            auth.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        try {
            const [contractsList, certificationsList, invoicesList, paymentsList] = await Promise.all([
                db.getAll('contracts', 'companyId', companies.currentCompany.id),
                db.getAll('certifications', 'companyId', companies.currentCompany.id),
                db.getAll('invoices', 'companyId', companies.currentCompany.id),
                db.getAll('payments', 'companyId', companies.currentCompany.id)
            ]);

            const salaryPaidMap = this.getSalaryPaidMap(paymentsList);
            const invoicePaidMap = this.getInvoicePaidMap(paymentsList);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const companyTax = this.utils.getCompanyTaxPercentage(companies.currentCompany);

            doc.setFontSize(20);
            doc.text(`Reporte - ${companies.currentCompany.name}`, 20, 20);
            doc.setFontSize(12);
            doc.text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, 20, 30);
            doc.text(`Impuestos empresa: ${companyTax.toFixed(2)}%`, 20, 37);

            const totalContracts = contractsList.length;
            const totalCertifications = certificationsList.length;
            const totalInvoices = invoicesList.length;
            const totalSalaryGenerated = certificationsList.reduce((sum, certification) => {
                const contract = contractsList.find(item => item.id === certification.contractId);
                return sum + this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
            }, 0);
            const totalSalaryPaid = Array.from(salaryPaidMap.values()).reduce((sum, value) => sum + value, 0);

            doc.text(`Contratos: ${totalContracts}`, 20, 50);
            doc.text(`Certificaciones: ${totalCertifications}`, 20, 57);
            doc.text(`Facturas: ${totalInvoices}`, 20, 64);
            doc.text(`Salario generado: ${this.utils.formatCurrency(totalSalaryGenerated)}`, 20, 71);
            doc.text(`Salario pagado: ${this.utils.formatCurrency(totalSalaryPaid)}`, 20, 78);

            doc.autoTable({
                startY: 88,
                head: [['Código', 'Cliente', 'Servicio', '% Imp.', 'Total contrato', '% Salario']],
                body: contractsList.map(contract => [
                    contract.code,
                    contract.client,
                    this.utils.formatCurrency(this.getContractSummary(contract, companyTax).serviceValue),
                    `${companyTax.toFixed(2)}%`,
                    this.utils.formatCurrency(this.getContractSummary(contract, companyTax).totalWithTax),
                    `${this.utils.toNumber(contract.salaryPercentage).toFixed(2)}%`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [26, 35, 126] }
            });

            doc.text('Incluye valor base + suplementos por contrato.', 20, doc.lastAutoTable.finalY + 10);

            doc.addPage();
            doc.autoTable({
                startY: 20,
                head: [['Contrato', 'Mes/Año', 'Monto cert.', 'Cert. + imp.', 'Salario gen.', 'Pendiente salario']],
                body: certificationsList.map(certification => {
                    const contract = contractsList.find(item => item.id === certification.contractId);
                    const generated = this.utils.calculateSalaryAmount(certification.amount, contract?.salaryPercentage || 0);
                    const paid = salaryPaidMap.get(certification.id) || 0;
                    return [
                        contract?.code || 'N/A',
                        this.utils.getCertificationPeriodLabel(certification),
                        this.utils.formatCurrency(certification.amount),
                        this.utils.formatCurrency(this.utils.calculateTotalWithTax(certification.amount, companyTax)),
                        this.utils.formatCurrency(generated),
                        this.utils.formatCurrency(Math.max(0, generated - paid))
                    ];
                }),
                theme: 'striped',
                headStyles: { fillColor: [0, 121, 107] }
            });

            doc.addPage();
            doc.autoTable({
                startY: 20,
                head: [['Factura', 'Contrato', 'Fecha', 'Monto', 'Pagado', 'Pendiente', 'Estado']],
                body: invoicesList.map(invoice => {
                    const contract = contractsList.find(item => item.id === invoice.contractId);
                    const paid = invoicePaidMap.get(invoice.id) || 0;
                    const pending = Math.max(0, this.utils.toNumber(invoice.amount) - paid);
                    return [
                        invoice.number,
                        contract?.code || 'N/A',
                        invoice.date,
                        this.utils.formatCurrency(invoice.amount),
                        this.utils.formatCurrency(paid),
                        this.utils.formatCurrency(pending),
                        this.getInvoiceStatus(invoice, paid)
                    ];
                }),
                theme: 'striped',
                headStyles: { fillColor: [255, 112, 67] }
            });

            const supplementsRows = contractsList.flatMap(contract =>
                (Array.isArray(contract.supplements) ? contract.supplements : []).map(supplement => [
                    contract.code,
                    supplement.date || '',
                    this.utils.formatCurrency(supplement.amount),
                    supplement.description || ''
                ])
            );
            if (supplementsRows.length > 0) {
                doc.addPage();
                doc.autoTable({
                    startY: 20,
                    head: [['Contrato', 'Fecha', 'Monto', 'Descripción']],
                    body: supplementsRows,
                    theme: 'striped',
                    headStyles: { fillColor: [63, 81, 181] }
                });
            }

            doc.save(`${companies.currentCompany.name}_reporte_${new Date().toISOString().split('T')[0]}.pdf`);
            auth.showMessage('PDF generado exitosamente', 'success');
        } catch (error) {
            console.error('Error al generar PDF:', error);
            auth.showMessage('Error al generar PDF', 'error');
        }
    }
}

const exportManager = new ExportManager();
