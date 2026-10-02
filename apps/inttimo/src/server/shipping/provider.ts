/** Contrato con la plataforma logística. Solo skydropx.ts habla con SkyDropX; el resto del código usa esto. */

export type AreaAddress = { postalCode: string; state: string; city: string; neighborhood: string };

export type ContactAddress = AreaAddress & {
  name: string;
  company: string | null;
  street: string;
  phone: string;
  email: string;
  reference: string | null;
};

export type Parcel = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };

export type Rate = {
  rateId: string;
  carrier: string;
  service: string;
  /** Días estimados según la paquetería; null si no los informa. */
  days: number | null;
  /** Centavos. */
  amount: number;
  currency: string;
};

export type Shipment = {
  shipmentId: string;
  /** Pueden llegar después: la paquetería genera la guía de forma asíncrona. */
  trackingNumber: string | null;
  labelUrl: string | null;
  carrier: string | null;
};

export interface ShippingProvider {
  quote(input: { from: AreaAddress; to: AreaAddress; parcel: Parcel; carriers: string[] }): Promise<{ quotationId: string; rates: Rate[] }>;
  createShipment(input: {
    quotationId: string;
    rateId: string;
    from: ContactAddress;
    to: ContactAddress;
    consignmentNote: string;
    packageType: string;
  }): Promise<Shipment>;
  getShipment(shipmentId: string): Promise<Shipment>;
}

export class ShippingUnavailableError extends Error {}
