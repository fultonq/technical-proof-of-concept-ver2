import { LabelAnalysisResult } from "@workspace/api-client-react";

export function exportSessionToCSV(results: LabelAnalysisResult[], filename = "session-export.csv") {
  const headers = [
    "File Name",
    "Beverage Type",
    "Overall Status",
    "Confidence Score",
    "Brand Name (Extracted)",
    "Brand Name (Status)",
    "Class Type (Extracted)",
    "Class Type (Status)",
    "Alcohol Content (Extracted)",
    "Alcohol Content (Status)",
    "Net Contents (Extracted)",
    "Net Contents (Status)",
    "Government Warning (Status)",
    "Bottler Producer (Extracted)",
    "Bottler Producer (Status)",
    "Flags Count"
  ];

  const escapeCSV = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = results.map(r => {
    return [
      r.fileName,
      r.beverageType,
      r.overallStatus,
      (r.confidenceScore * 100).toFixed(1) + "%",
      r.brandName.extractedValue,
      r.brandName.matchStatus,
      r.classType.extractedValue,
      r.classType.matchStatus,
      r.alcoholContent.extractedValue,
      r.alcoholContent.matchStatus,
      r.netContents.extractedValue,
      r.netContents.matchStatus,
      r.governmentWarning.matchStatus,
      r.bottlerProducer.extractedValue,
      r.bottlerProducer.matchStatus,
      r.flags.length
    ].map(escapeCSV).join(",");
  });

  const csvContent = [headers.map(escapeCSV).join(","), ...rows].join("\n");
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}