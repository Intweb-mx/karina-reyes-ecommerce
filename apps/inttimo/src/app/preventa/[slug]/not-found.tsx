import { StateMessage } from "@/components/presale/sections/StateMessage";

export default function PresaleNotFound() {
  return (
    <main className="container-page flex flex-1 flex-col justify-center py-24">
      <StateMessage
        as="h1"
        eyebrow="Preventa"
        title="No encontramos esta preventa."
        body="Revisa que el enlace esté completo. Si llegaste desde un correo o una publicación, vuelve a abrirlo desde ahí."
      />
    </main>
  );
}
