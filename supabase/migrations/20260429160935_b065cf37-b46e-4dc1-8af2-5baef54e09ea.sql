-- Enable realtime for marketplace orders so vendors see new orders live
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;