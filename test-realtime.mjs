import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function checkPublication() {
  const { data, error } = await supabase.rpc('get_publications');
  // If rpc doesn't exist, we can try querying pg_publication_tables directly using a raw query if they have an endpoint, but standard supabase-js doesn't support raw SQL.
  // Instead, let's just listen to the channel and insert a dummy row.
  
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
        
        // Let's insert a dummy transaction to trigger it ourselves
        setTimeout(async () => {
          console.log("Inserting dummy transaction...");
          const { data, error } = await supabase.from('transactions').insert({
            cashier_name: 'System Test',
            payment_method: 'cash',
            subtotal: 1000,
            amount_paid: 1000,
            status: 'completed'
          }).select();
          
          if (error) console.error("Insert error:", error);
          else console.log("Insert success:", data[0]?.id);
          
          // Delete it after
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
    
    // Timeout after 15 seconds
    setTimeout(() => {
      console.log("Timeout reached. No realtime events received.");
      process.exit(1);
    }, 15000);
}

checkPublication();
