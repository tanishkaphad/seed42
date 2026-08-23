import { deliverLiveEmail } from './src/mail/deliver.js';

async function run() {
  console.log('Sending test payload to Make.com mailhook...');
  const res = await deliverLiveEmail({
    intended: '3bgpnao8bvr67gmfe3mganjic31g1f15@hook.eu1.make.com',
    subject: 'Delivery Confirmation',
    body: 'We confirm the deal for COMP-101. Unit price ₹132. Quantity 5000 units shipped today. Delivery in 4 days.',
    audience: 'supplier',
  });
  console.log('Result:', res);
}

run().catch(console.error);
