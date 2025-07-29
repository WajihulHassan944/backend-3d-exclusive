import { Invoice } from "../models/invoice.js";

export const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `X3D-${year}-`;

  // Find the most recent invoice for the current year
  const lastInvoice = await Invoice.findOne({
    invoiceNumber: { $regex: `^${prefix}` }
  }).sort({ issuedAt: -1 });

  let number = 1;
  if (lastInvoice) {
    const lastNum = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    number = lastNum + 1;
  }

  const padded = number.toString().padStart(4, '0'); // e.g. 0004
  return `${prefix}${padded}`;
};
