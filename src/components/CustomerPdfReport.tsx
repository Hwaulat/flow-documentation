import { useEffect, useState } from "react";

import { formatDateId, formatDateTimeId, POINT_SOURCE_META, PROJECT_STATUS_META } from "@/lib/formatters";
import type { AttachmentRecord, FeatureRecord, PointRecord, ProjectRecord } from "@/lib/local-db";

interface CustomerPdfReportProps {
  mode: "project" | "feature";
  project: ProjectRecord;
  features: FeatureRecord[];
  pointsByFeature: Map<string, PointRecord[]>;
  attachmentsByPoint: Map<string, AttachmentRecord[]>;
  thumbnails: Record<string, string>;
}

const SERIF_FONT_STYLE = {
  fontFamily: '"Times New Roman", Times, Georgia, serif',
} as const;

export function CustomerPdfReport({
  mode,
  project,
  features,
  pointsByFeature,
  attachmentsByPoint,
  thumbnails,
}: CustomerPdfReportProps) {
  const [printedAt, setPrintedAt] = useState<string>("");

  useEffect(() => {
    setPrintedAt(new Date().toISOString());
    const handleBeforePrint = () => setPrintedAt(new Date().toISOString());
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, []);

  const totalPoints = features.reduce(
    (sum, feature) => sum + (pointsByFeature.get(feature.id)?.length ?? 0),
    0,
  );
  const statusLabel = PROJECT_STATUS_META[project.status].label;
  const docCode = `DOC-${project.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;
  const formattedPrintDate = printedAt ? formatDateId(printedAt) : formatDateId(project.updatedAt);
  const formattedPrintDateTime = printedAt
    ? formatDateTimeId(printedAt)
    : formatDateTimeId(project.updatedAt);
  const focusFeature = mode === "feature" ? features[0] : undefined;

  return (
    <article
      data-print-only="true"
      style={SERIF_FONT_STYLE}
      className="pdf-report hidden bg-white text-[11pt] leading-normal text-slate-950"
    >
      {/* Kop Laporan Formal */}
      <header className="border-b-[2.5px] border-slate-900 pb-3.5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[8.5pt] font-bold tracking-[0.16em] text-slate-600 uppercase">
              Laporan Dokumentasi Kebutuhan Pelanggan
            </p>
            <h1 className="mt-1 text-[18pt] font-bold leading-tight text-slate-950">
              {focusFeature ? `${project.name} — ${focusFeature.name}` : project.name}
            </h1>
            {project.customerName && (
              <p className="mt-1 text-[10.5pt] text-slate-700">
                Disusun untuk Pelanggan: <span className="font-bold">{project.customerName}</span>
              </p>
            )}
          </div>

          <div className="shrink-0 border border-slate-400 bg-slate-50 px-3 py-2 text-[9pt] leading-snug text-slate-800">
            <div className="flex justify-between gap-4">
              <span className="font-bold text-slate-600">No. Dokumen</span>
              <span>{docCode}</span>
            </div>
            <div className="mt-0.5 flex justify-between gap-4">
              <span className="font-bold text-slate-600">Tanggal Cetak</span>
              <span>{formattedPrintDate}</span>
            </div>
            <div className="mt-0.5 flex justify-between gap-4">
              <span className="font-bold text-slate-600">Status Proyek</span>
              <span className="font-bold">{statusLabel}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Ringkasan Informasi Proyek */}
      <section className="mt-5">
        <h2 className="mb-2 text-[11.5pt] font-bold tracking-wide text-slate-950 uppercase">
          I. Informasi Proyek
        </h2>
        <table className="w-full border-collapse text-[10pt]">
          <tbody>
            <tr>
              <th className="w-[19%] border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-800">
                Nama Proyek
              </th>
              <td className="w-[31%] border border-slate-400 px-2.5 py-1.5 text-slate-950">
                {project.name}
              </td>
              <th className="w-[19%] border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-800">
                Pelanggan / Klien
              </th>
              <td className="w-[31%] border border-slate-400 px-2.5 py-1.5 text-slate-950">
                {project.customerName || "—"}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-800">
                Status
              </th>
              <td className="border border-slate-400 px-2.5 py-1.5 text-slate-950">
                {statusLabel}
              </td>
              <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-800">
                Terakhir Diperbarui
              </th>
              <td className="border border-slate-400 px-2.5 py-1.5 text-slate-950">
                {formatDateTimeId(project.updatedAt)}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-800">
                {focusFeature ? "Nama Fitur" : "Cakupan Fitur"}
              </th>
              <td className="border border-slate-400 px-2.5 py-1.5 text-slate-950">
                {focusFeature ? focusFeature.name : `${features.length} Fitur Terdokumentasi`}
              </td>
              <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-bold text-slate-800">
                Total Poin Kebutuhan
              </th>
              <td className="border border-slate-400 px-2.5 py-1.5 font-bold text-slate-950">
                {totalPoints} Poin
              </td>
            </tr>
            {project.description && (
              <tr>
                <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left align-top font-bold text-slate-800">
                  Deskripsi Proyek
                </th>
                <td
                  colSpan={3}
                  className="border border-slate-400 px-2.5 py-1.5 whitespace-pre-wrap text-slate-900"
                >
                  {project.description}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Rincian Daftar Fitur & Poin Kebutuhan Pelanggan */}
      <section className="mt-6 space-y-5">
        <h2 className="border-b border-slate-400 pb-1 text-[11.5pt] font-bold tracking-wide text-slate-950 uppercase">
          {focusFeature
            ? "II. Daftar Poin Kebutuhan Pelanggan"
            : "II. Rincian Fitur & Poin Kebutuhan Pelanggan"}
        </h2>

        {features.length === 0 ? (
          <p className="border border-slate-300 px-3 py-4 text-center text-[10pt] italic text-slate-600">
            Belum ada fitur atau poin kebutuhan pelanggan yang tercatat pada proyek ini.
          </p>
        ) : (
          features.map((feature, featureIndex) => {
            const featurePoints = pointsByFeature.get(feature.id) ?? [];

            return (
              <div key={feature.id} className="space-y-2">
                {!focusFeature && (
                  <div className="flex items-baseline justify-between border-b border-slate-300 pb-1">
                    <h3 className="text-[11pt] font-bold text-slate-950">
                      {featureIndex + 1}. {feature.name}
                    </h3>
                    <span className="text-[9.5pt] text-slate-600">
                      {featurePoints.length} Poin Kebutuhan
                    </span>
                  </div>
                )}

                {featurePoints.length === 0 ? (
                  <p className="border border-slate-300 px-3 py-3 text-[10pt] italic text-slate-600">
                    Belum ada poin kebutuhan pelanggan untuk fitur ini.
                  </p>
                ) : (
                  <table className="w-full border-collapse text-[10pt]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900">
                        <th className="w-[7%] border border-slate-400 px-2 py-2 text-center font-bold">
                          No
                        </th>
                        <th className="w-[46%] border border-slate-400 px-2.5 py-2 text-left font-bold">
                          Poin Kebutuhan Pelanggan
                        </th>
                        <th className="w-[14%] border border-slate-400 px-2 py-2 text-left font-bold">
                          Sumber
                        </th>
                        <th className="w-[18%] border border-slate-400 px-2 py-2 text-left font-bold">
                          Narasumber
                        </th>
                        <th className="w-[15%] border border-slate-400 px-2 py-2 text-center font-bold">
                          Tanggal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {featurePoints.map((point, ptIdx) => {
                        const pointAttachments = attachmentsByPoint.get(point.id) ?? [];

                        return (
                          <tr
                            key={point.id}
                            className={ptIdx % 2 === 1 ? "bg-slate-50/75" : "bg-white"}
                          >
                            <td className="border border-slate-400 px-2 py-2 text-center align-top font-semibold">
                              {ptIdx + 1}
                            </td>
                            <td className="border border-slate-400 px-2.5 py-2 align-top">
                              <p className="whitespace-pre-wrap leading-relaxed text-slate-950">
                                {point.content}
                              </p>

                              {pointAttachments.length > 0 && (
                                <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-1.5">
                                  <p className="text-[8.5pt] font-bold text-slate-600">
                                    Lampiran ({pointAttachments.length}):
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {pointAttachments.map((att) => {
                                      const thumbUrl = thumbnails[att.id];
                                      return thumbUrl ? (
                                        <figure
                                          key={att.id}
                                          className="border border-slate-300 bg-white p-1"
                                        >
                                          <img
                                            src={thumbUrl}
                                            alt={att.caption || att.originalName}
                                            className="max-h-24 w-auto max-w-[160px] object-contain"
                                          />
                                          {(att.caption || att.originalName) && (
                                            <figcaption className="mt-0.5 max-w-[160px] truncate text-[8pt] text-slate-600">
                                              {att.caption || att.originalName}
                                            </figcaption>
                                          )}
                                        </figure>
                                      ) : (
                                        <span
                                          key={att.id}
                                          className="border border-slate-300 px-1.5 py-0.5 text-[8.5pt] text-slate-700"
                                        >
                                          {att.caption || att.originalName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="border border-slate-400 px-2 py-2 align-top">
                              {POINT_SOURCE_META[point.source].label}
                            </td>
                            <td className="border border-slate-400 px-2 py-2 align-top">
                              {point.statedBy || "—"}
                            </td>
                            <td className="border border-slate-400 px-2 py-2 text-center align-top whitespace-nowrap">
                              {point.mentionedOn ? formatDateId(point.mentionedOn) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Catatan Penutup & Lembar Konfirmasi */}
      <footer className="print-avoid-break mt-7 space-y-5 border-t border-slate-400 pt-4">
        <p className="text-[9.5pt] italic text-slate-700">
          Dokumen ini merupakan rangkuman resmi daftar kebutuhan pelanggan untuk{" "}
          <span className="font-bold not-italic">{project.name}</span>. Apabila terdapat penyesuaian
          atau tambahan poin, silakan koordinasikan kembali bersama tim proyek terkait.
        </p>

        <div className="grid grid-cols-2 gap-12 pt-2 text-center text-[10pt]">
          <div>
            <p className="text-slate-700">Disiapkan Oleh,</p>
            <div className="mt-14 border-b border-slate-500 pb-1 font-bold text-slate-950">
              Tim Proyek
            </div>
            <p className="mt-1 text-[8.5pt] text-slate-600">Penyusun Dokumentasi</p>
          </div>
          <div>
            <p className="text-slate-700">Mengetahui / Pelanggan,</p>
            <div className="mt-14 border-b border-slate-500 pb-1 font-bold text-slate-950">
              {project.customerName || "Perwakilan Pelanggan"}
            </div>
            <p className="mt-1 text-[8.5pt] text-slate-600">Konfirmasi Kebutuhan</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-300 pt-2 text-[8.5pt] text-slate-500">
          <span>FlowDoc · Laporan Resmi Proyek ({docCode})</span>
          <span>Dicetak pada {formattedPrintDateTime}</span>
        </div>
      </footer>
    </article>
  );
}
