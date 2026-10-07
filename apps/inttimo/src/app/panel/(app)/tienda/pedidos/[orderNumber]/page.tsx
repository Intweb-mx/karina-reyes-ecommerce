import { AdminOrderView } from "@/components/store/admin/AdminOrderView";

export const metadata = { title: "Pedido de la tienda" };

export default async function StoreAdminOrderPage({ params }: PageProps<"/panel/tienda/pedidos/[orderNumber]">) {
  const { orderNumber } = await params;
  return <AdminOrderView orderNumber={decodeURIComponent(orderNumber)} />;
}
