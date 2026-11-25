import {
  createId,
  currentTimestamp,
  saveFeature,
  savePoint,
  saveProject,
  type FeatureRecord,
  type PointRecord,
  type ProjectRecord,
} from "@/lib/local-db";
import { todayYmd } from "@/lib/formatters";

export async function createSampleProject(): Promise<ProjectRecord> {
  const now = currentTimestamp();
  const today = todayYmd();
  const projectId = createId();

  const project: ProjectRecord = {
    id: projectId,
    name: "Portal Klaim & Penagihan Pelanggan",
    customerName: "PT Nusantara Logistik",
    description:
      "Dokumentasi alur pengajuan klaim, verifikasi invoice, dan pelacakan status pembayaran pelanggan B2B.",
    status: "active",
    processFlow: [
      "1. Admin pelanggan masuk ke portal dan mengunggah dokumen surat jalan serta nomor invoice.",
      "2. Sistem memvalidasi nomor invoice dan kelengkapan lampiran secara otomatis.",
      "3. Tim finance meninjau pengajuan, menyetujui atau meminta revisi dengan catatan.",
      "4. Setelah disetujui, pelanggan dapat mengunduh bukti persetujuan dan rekap PDF.",
    ].join("\n"),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const features: FeatureRecord[] = [
    {
      id: createId(),
      projectId,
      name: "Unggah & Validasi Invoice",
      flowNotes:
        "Pelanggan memasukkan nomor PO, nomor invoice, dan mengunggah file PDF/gambar sebagai bukti.",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: createId(),
      projectId,
      name: "Persetujuan Tim Finance",
      flowNotes:
        "Daftar antrean pengajuan dengan filter status serta catatan revisi yang tercatat per poin.",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: createId(),
      projectId,
      name: "Ekspor Rekap & Notifikasi",
      flowNotes:
        "Rekap bulanan dalam format PDF dan ringkasan status melalui email/WhatsApp admin.",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ];

  const firstFeatureId = features[0]?.id ?? "";
  const secondFeatureId = features[1]?.id ?? "";
  const thirdFeatureId = features[2]?.id ?? "";

  const points: PointRecord[] = [
    {
      id: createId(),
      featureId: firstFeatureId,
      content: "Pelanggan meminta nomor invoice otomatis dicek duplikasinya sebelum form dikirim.",
      mentionedOn: today,
      source: "Meeting",
      statedBy: "Bu Ratna (Finance)",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: createId(),
      featureId: firstFeatureId,
      content: "Ukuran lampiran foto surat jalan dari gudang maksimal 10 MB format JPG/PNG.",
      mentionedOn: today,
      source: "WhatsApp",
      statedBy: "Pak Hendra",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: createId(),
      featureId: secondFeatureId,
      content: "Jika ada revisi, alasan penolakan wajib diisi agar cabang tahu dokumen apa yang kurang.",
      mentionedOn: today,
      source: "Call",
      statedBy: "Dina (Operasional)",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: createId(),
      featureId: thirdFeatureId,
      content: "Rekap bulanan harus bisa diekspor langsung menjadi dokumen PDF yang rapi untuk arsip.",
      mentionedOn: today,
      source: "Email",
      statedBy: "Pak Hendra",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ];

  await saveProject(project);
  for (const feature of features) await saveFeature(feature);
  for (const point of points) await savePoint(point);

  return project;
}
