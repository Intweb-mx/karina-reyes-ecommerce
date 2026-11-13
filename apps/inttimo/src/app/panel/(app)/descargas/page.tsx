import { requireAdmin } from "@/server/auth/admin";
import { Card, PageHeader } from "../../ui";
import { resendDownloadAction } from "./actions";
import { ResendDownloadForm } from "./ResendDownloadForm";

export const metadata = { title: "Reenviar descarga" };

/** Reenvío del enlace de descarga de un producto digital (p. ej. el PDF), cuando el cliente lo pide. */
export default async function ResendDownloadPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Reenviar descarga" subtitle="Para quien compró un producto digital (el PDF) y perdió el archivo o no pudo descargarlo." />
      <Card
        title="Enlace nuevo de descarga"
        description="El enlace llega al correo con el que se hizo la compra y sirve una sola vez. Los enlaces anteriores que no se usaron dejan de funcionar."
      >
        <ResendDownloadForm action={resendDownloadAction} />
      </Card>
    </>
  );
}
