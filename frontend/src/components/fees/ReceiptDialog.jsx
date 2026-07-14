import jsPDF from "jspdf";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

function downloadReceiptPdf(model) {
  const pdf = new jsPDF({ unit: "mm", format: "a5" });
  const CX  = 74;
  let y = 12;

  const line = (x1, x2, yy) => {
    pdf.setDrawColor(220, 220, 220);
    pdf.line(x1, yy, x2, yy);
  };

  // School header
  if (model.header.schoolName) {
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 30, 30);
    pdf.text(model.header.schoolName, CX, y, { align: "center" });
    y += 5;
    if (model.header.schoolAddress) {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(120, 120, 120);
      pdf.text(model.header.schoolAddress, CX, y, { align: "center" });
      y += 4;
    }
    line(14, 134, y); y += 5;
  }

  // Title
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(40, 40, 40);
  pdf.text("Fee Receipt", CX, y, { align: "center" });
  y += 5;

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(150, 150, 150);
  pdf.text(model.header.receiptNo, CX, y, { align: "center" });
  y += 2;

  if (model.paymentInfo.status === "cancelled") {
    pdf.setFontSize(9);
    pdf.setTextColor(200, 60, 60);
    pdf.text("[ CANCELLED ]", CX, y + 3, { align: "center" });
    y += 6;
  }

  line(14, 134, y); y += 4;

  const row = (label, value, bold = false) => {
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120, 120, 120);
    pdf.text(label, 18, y);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(value), 80, y);
    line(14, 134, y + 3);
    y += 10;
  };

  // Student info
  row("Student",  model.student.studentName);
  row("Adm. No.", model.student.admissionNumber || "—");
  row("Class",    `${model.student.className} ${model.student.section}`.trim());
  row("Year",     model.header.academicYear);

  // Payment info
  row("Date",         model.paymentInfo.paymentDate);
  row("Mode",         model.paymentInfo.paymentMode);
  row("Collected By", model.paymentInfo.collectedBy || "—");
  if (model.paymentInfo.remarks) row("Remarks", model.paymentInfo.remarks);

  // Allocation breakdown
  if (model.allocationTable.openingBalance) {
    row("Prior Balance", INR(model.allocationTable.openingBalance.allocatedAmount));
  }

  for (const inst of model.allocationTable.installments) {
    row(inst.periodLabel, INR(inst.allocatedAmount));
    for (const comp of inst.components) {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(140, 140, 140);
      pdf.text(`  • ${comp.label}`, 20, y - 4);
      pdf.text(INR(comp.allocatedAmount), 80, y - 4);
    }
  }

  // Grand total
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(30, 30, 30);
  pdf.text("Total Paid", 18, y);
  pdf.text(INR(model.totals.grandTotal), 80, y);
  line(14, 134, y + 3); y += 10;

  // Footer
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(180, 180, 180);
  pdf.text("This is a computer-generated receipt.", CX, y + 4, { align: "center" });

  pdf.save(`receipt-${model.header.receiptNo}.pdf`);
}

export default function ReceiptDialog({ open, onOpenChange, receiptModel }) {
  if (!receiptModel) return null;

  const { header, student, paymentInfo, allocationTable, totals } = receiptModel;
  const isCancelled = paymentInfo.status === "cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Fee Receipt
            {isCancelled && (
              <span className="text-xs font-normal text-red-500 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                CANCELLED
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm max-h-[65vh] overflow-y-auto pr-1">
          {/* Header */}
          {header.schoolName && (
            <div className="text-center pb-2 border-b">
              <p className="font-semibold text-gray-800">{header.schoolName}</p>
              {header.schoolAddress && <p className="text-xs text-gray-400">{header.schoolAddress}</p>}
            </div>
          )}

          <p className="text-center text-xs text-gray-400 font-mono">{header.receiptNo}</p>

          {/* Student & payment info */}
          <div className="border rounded-md divide-y">
            {[
              ["Student",      student.studentName],
              student.admissionNumber && ["Adm. No.",   student.admissionNumber],
              ["Class",        `${student.className} ${student.section}`.trim()],
              ["Academic Year",header.academicYear],
              ["Date",         paymentInfo.paymentDate],
              ["Mode",         paymentInfo.paymentMode],
              paymentInfo.collectedBy && ["Collected By", paymentInfo.collectedBy],
              paymentInfo.remarks && ["Remarks", paymentInfo.remarks],
            ].filter(Boolean).map(([label, value]) => (
              <div key={label} className="flex justify-between px-3 py-2">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Allocation breakdown */}
          <div className="border rounded-md divide-y">
            {allocationTable.openingBalance && (
              <div className="px-3 py-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">{allocationTable.openingBalance.label}</span>
                  <span className="font-medium">{INR(allocationTable.openingBalance.allocatedAmount)}</span>
                </div>
              </div>
            )}
            {allocationTable.installments.map((inst) => (
              <div key={inst.installmentId} className="px-3 py-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">{inst.periodLabel}</span>
                  <span className="font-medium">{INR(inst.allocatedAmount)}</span>
                </div>
                {inst.components.length > 0 && (
                  <div className="pl-3 space-y-0.5">
                    {inst.components.map((c) => (
                      <div key={c.feeStructureId} className="flex justify-between text-xs text-gray-400">
                        <span>{c.label}</span>
                        <span>{INR(c.allocatedAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 font-semibold bg-gray-50">
              <span>Total Paid</span>
              <span className="text-indigo-600">{INR(totals.grandTotal)}</span>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400">Computer-generated receipt</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => downloadReceiptPdf(receiptModel)}>
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
