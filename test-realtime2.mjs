import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function checkPublication() {
  console.log("Subscribing to realtime...");
  const channel = supabase.channel('test-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
      console.log('REALTIME EVENT RECEIVED:', payload);
      process.exit(0);
    })
    .subscribe((status) => {
      console.log("Channel status:", status);
      if (status === 'SUBSCRIBED') {
        console.log("Successfully subscribed. Please make a transaction in the app now.");
        
        setTimeout(async () => {
          console.log("Inserting dummy transaction...");
          const { data, error } = await supabase.from('transactions').insert({
            cashier_name: 'System Test',
            payment_method: 'cash',
            subtotal: 1000,
            tax: 0,
            amount_paid: 1000,
            status: 'completed'
          }).select();
          
          if (error) console.error("Insert error:", error);
          else console.log("Insert success:", data[0]?.id);
          
          if (data && data[0]) {
             setTimeout(async () => {
               await supabase.from('transactions').delete().eq('id', data[0].id);
               console.log("Deleted dummy transaction.");
               process.exit(0);
             }, 3000);
          }
        }, 2000);
      }
    });
    
    setTimeout(() => {
      console.log("Timeout reached. No realtime events received.");
      process.exit(1);
    }, 15000);
}

checkPublication();
