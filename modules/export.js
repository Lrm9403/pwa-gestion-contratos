class ExportManager {
    constructor() {
        this.init();
    }

    init() {
        document.getElementById('export-excel')?.addEventListener('click', () => this.exportToExcel());
        document.getElementById('export-pdf')?.addEventListener('click', () => this.exportToPDF());
    }

    async exportToExcel() {
        if (!contracts.currentCompany || !auth.currentUser) {
            auth.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        try {
            // Obtener todos los datos de la empresa actual
            const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', contracts.currentCompany.id);
            const invoices = await db.getAll('invoices', 'companyId', contracts.currentCompany.id);
            const payments = await db.getAll('payments', 'companyId', contracts.currentCompany.id);
            
            // Crear workbook
            const wb = XLSX.utils.book_new();
            
            // Hoja de contratos
            const contractsData = contractsList.map(c => ({
                'Código': c.code,
                'Cliente': c.client,
                'Valor Servicio': c.serviceValue,
                'Valor Contrato (+15%)': c.serviceValue * 1.15,
                '% Salario': c.salaryPercentage,
                'Fecha Inicio': c.startDate,
                'Fecha Fin': c.endDate,
                'Estado': c.status
            }));
            const wsContracts = XLSX.utils.json_to_sheet(contractsData);
            XLSX.utils.book_append_sheet(wb, wsContracts, 'Contratos');
            
            // Hoja de certificaciones
            const certsData = certifications.map(c => {
                const contract = contractsList.find(con => con.id === c.contractId);
                const salaryGenerated = c.amount * (c.salaryPercentage / 100);
                return {
                    'Contrato': contract?.code || 'N/A',
                    'Mes/Año': `${c.month}/${c.year}`,
                    'Monto Certificado': c.amount,
                    'Salario Generado': salaryGenerated,
                    '% Salario': c.salaryPercentage,
                    'Estado': c.status
                };
            });
            const wsCerts = XLSX.utils.json_to_sheet(certsData);
            XLSX.utils.book_append_sheet(wb, wsCerts, 'Certificaciones');
            
            // Hoja de pagos
            const paymentsData = payments.map(p => {
                const cert = certifications.find(c => c.id === p.certificationId);
                const contract = cert ? contractsList.find(c => c.id === cert.contractId) : null;
                return {
                    'Fecha': p.date,
                    'Concepto': p.type === 'salary' ? 'Salario' : 'Otro',
                    'Monto': p.amount,
                    'Método': p.method,
                    'Contrato': contract?.code || 'N/A',
                    'Certificación': cert ? `${cert.month}/${cert.year}` : 'N/A',
                    'Notas': p.notes || ''
                };
            });
            const wsPayments = XLSX.utils.json_to_sheet(paymentsData);
            XLSX.utils.book_append_sheet(wb, wsPayments, 'Pagos');
            
            // Generar archivo
            const fileName = `${contracts.currentCompany.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            auth.showMessage('Exportación completada', 'success');
            
        } catch (error) {
            console.error('Error al exportar a Excel:', error);
            auth.showMessage('Error al exportar a Excel', 'error');
        }
    }

    async exportToPDF() {
        if (!contracts.currentCompany || !auth.currentUser) {
            auth.showMessage('Primero selecciona una empresa', 'error');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Título
            doc.setFontSize(20);
            doc.text(`Reporte - ${contracts.currentCompany.name}`, 20, 20);
            doc.setFontSize(12);
            doc.text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, 20, 30);
            
            // Obtener datos
            const contractsList = await db.getAll('contracts', 'companyId', contracts.currentCompany.id);
            const certifications = await db.getAll('certifications', 'companyId', contracts.currentCompany.id);
            const payments = await db.getAll('payments', 'companyId', contracts.currentCompany.id);
            
            // Resumen
            let yPos = 50;
            doc.setFontSize(16);
            doc.text('Resumen', 20, yPos);
            yPos += 10;
            
            doc.setFontSize(12);
            doc.text(`Total Contratos: ${contractsList.length}`, 20, yPos);
            yPos += 7;
            doc.text(`Total Certificaciones: ${certifications.length}`, 20, yPos);
            yPos += 7;
            
            // Calcular totales
            const totalGenerated = certifications.reduce((sum, cert) => sum + cert.amount, 0);
            doc.text(`Total Certificado: $${totalGenerated.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, 20, yPos);
            yPos += 7;
            
            const salaryPayments = payments.filter(p => p.type === 'salary');
            const totalSalaryPaid = salaryPayments.reduce((sum, p) => sum + p.amount, 0);
            doc.text(`Total Salario Pagado: $${totalSalaryPaid.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, 20, yPos);
            yPos += 15;
            
            // Tabla de contratos
            doc.setFontSize(14);
            doc.text('Contratos', 20, yPos);
            yPos += 10;
            
            const contractHeaders = [['Código', 'Cliente', 'Valor Servicio', '% Salario', 'Estado']];
            const contractData = contractsList.map(c => [
                c.code,
                c.client,
                `$${c.serviceValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`,
                `${c.salaryPercentage}%`,
                c.status
            ]);
            
            doc.autoTable({
                startY: yPos,
                head: contractHeaders,
                body: contractData,
                theme: 'striped',
                headStyles: { fillColor: [26, 35, 126] }
            });
            
            yPos = doc.lastAutoTable.finalY + 10;
            
            // Si hay más espacio, agregar certificaciones
            if (yPos < 250) {
                doc.addPage();
                yPos = 20;
                doc.setFontSize(14);
                doc.text('Certificaciones Pendientes', 20, yPos);
                yPos += 10;
                
                const pendingCerts = certifications.filter(c => c.status === 'pendiente');
                if (pendingCerts.length > 0) {
                    const certHeaders = [['Contrato', 'Mes/Año', 'Monto', 'Salario Generado']];
                    const certData = pendingCerts.map(c => {
                        const contract = contractsList.find(con => con.id === c.contractId);
                        const salaryGenerated = c.amount * (c.salaryPercentage / 100);
                        return [
                            contract?.code || 'N/A',
                            `${c.month}/${c.year}`,
                            `$${c.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`,
                            `$${salaryGenerated.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                        ];
                    });
                    
                    doc.autoTable({
                        startY: yPos,
                        head: certHeaders,
                        body: certData,
                        theme: 'striped',
                        headStyles: { fillColor: [26, 35, 126] }
                    });
                } else {
                    doc.setFontSize(12);
                    doc.text('No hay certificaciones pendientes', 20, yPos);
                }
            }
            
            // Guardar PDF
            const fileName = `${contracts.currentCompany.name}_reporte_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            
            auth.showMessage('PDF generado exitosamente', 'success');
            
        } catch (error) {
            console.error('Error al generar PDF:', error);
            auth.showMessage('Error al generar PDF', 'error');
        }
    }
}

const exportManager = new ExportManager();
