export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          field_name: string | null
          id: string
          metadata: Json
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_activity_log: {
        Row: {
          action: string
          admin_id: string
          company_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json
          price: number | null
          product_id: string | null
          user_id: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json
          price?: number | null
          product_id?: string | null
          user_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json
          price?: number | null
          product_id?: string | null
          user_id?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      analytics_rejections: {
        Row: {
          created_at: string
          event_name: string | null
          id: string
          ip_hash: string | null
          payload: Json
          reason: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name?: string | null
          id?: string
          ip_hash?: string | null
          payload?: Json
          reason: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string | null
          id?: string
          ip_hash?: string | null
          payload?: Json
          reason?: string
          user_id?: string | null
        }
        Relationships: []
      }
      checkout_optimization_baselines: {
        Row: {
          abandonment_rate: number
          add_to_cart: number
          cart_rate: number
          checkout_view: number
          completed: number
          conversion_rate: number
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          recommendation_id: string
          vendor_id: string | null
          views: number
        }
        Insert: {
          abandonment_rate?: number
          add_to_cart?: number
          cart_rate?: number
          checkout_view?: number
          completed?: number
          conversion_rate?: number
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          recommendation_id: string
          vendor_id?: string | null
          views?: number
        }
        Update: {
          abandonment_rate?: number
          add_to_cart?: number
          cart_rate?: number
          checkout_view?: number
          completed?: number
          conversion_rate?: number
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          recommendation_id?: string
          vendor_id?: string | null
          views?: number
        }
        Relationships: []
      }
      client_error_logs: {
        Row: {
          company_id: string | null
          context: Json | null
          created_at: string
          id: string
          message: string
          route: string | null
          severity: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          route?: string | null
          severity?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          route?: string | null
          severity?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          brand_color: string
          company_type: Database["public"]["Enums"]["company_type"] | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          display_name: string
          ice: string | null
          id: string
          if_number: string | null
          is_listed: boolean
          logo_url: string | null
          name: string
          onboarding_state: Json
          payment_instructions: string
          rc: string | null
          slug: string
          tva: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string
          company_type?: Database["public"]["Enums"]["company_type"] | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_name?: string
          ice?: string | null
          id?: string
          if_number?: string | null
          is_listed?: boolean
          logo_url?: string | null
          name: string
          onboarding_state?: Json
          payment_instructions?: string
          rc?: string | null
          slug: string
          tva?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string
          company_type?: Database["public"]["Enums"]["company_type"] | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_name?: string
          ice?: string | null
          id?: string
          if_number?: string | null
          is_listed?: boolean
          logo_url?: string | null
          name?: string
          onboarding_state?: Json
          payment_instructions?: string
          rc?: string | null
          slug?: string
          tva?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_subscriptions: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          product_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          product_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          product_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_events_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          company_id: string
          id: string
          product_id: string
          quantity_available: number
          quantity_on_hand: number
          quantity_reserved: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          id?: string
          product_id: string
          quantity_available?: number
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          id?: string
          product_id?: string
          quantity_available?: number
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          product_id: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string
          id?: string
          invoice_id: string
          product_id?: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          product_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          company_id: string
          next_number: number
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          next_number?: number
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          next_number?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_id: string
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          email_sent_at: string | null
          id: string
          invoice_number: string
          issue_date: string
          issued_at: string | null
          notes: string | null
          order_id: string
          paid_at: string | null
          payment_method: string | null
          payment_proof_url: string | null
          pdf_path: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_mad: number
          total_mad: number
          updated_at: string
          vat_amount_mad: number
          vat_rate: number
        }
        Insert: {
          buyer_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          email_sent_at?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          issued_at?: string | null
          notes?: string | null
          order_id: string
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_mad?: number
          total_mad?: number
          updated_at?: string
          vat_amount_mad?: number
          vat_rate?: number
        }
        Update: {
          buyer_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          email_sent_at?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_mad?: number
          total_mad?: number
          updated_at?: string
          vat_amount_mad?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_buyer"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          points: number
          type: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points: number
          type: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_health_scans: {
        Row: {
          broken_count: number
          company_id: string
          created_at: string
          id: string
          ok_count: number
          results: Json
          scanned_at: string
          scanned_by: string | null
          total: number
        }
        Insert: {
          broken_count?: number
          company_id: string
          created_at?: string
          id?: string
          ok_count?: number
          results?: Json
          scanned_at?: string
          scanned_by?: string | null
          total?: number
        }
        Update: {
          broken_count?: number
          company_id?: string
          created_at?: string
          id?: string
          ok_count?: number
          results?: Json
          scanned_at?: string
          scanned_by?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_health_scans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          link: string | null
          metadata: Json
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cost_snapshot: number | null
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price_mad: number
        }
        Insert: {
          cost_snapshot?: number | null
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price_mad: number
        }
        Update: {
          cost_snapshot?: number | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price_mad?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          buyer_id: string
          company_id: string
          created_at: string
          external_id: string | null
          external_status: string | null
          id: string
          notes: string | null
          order_number: string
          payment_method: string | null
          payment_paid_at: string | null
          payment_provider: string | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          request_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          sync_error: string | null
          total_mad: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          buyer_id: string
          company_id: string
          created_at?: string
          external_id?: string | null
          external_status?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_method?: string | null
          payment_paid_at?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          request_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          sync_error?: string | null
          total_mad?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          buyer_id?: string
          company_id?: string
          created_at?: string
          external_id?: string | null
          external_status?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_paid_at?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          request_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          sync_error?: string | null
          total_mad?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_fk"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          paid_at: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id: string
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          position: number
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          order_id: string | null
          product_id: string
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at: string
          user_id: string
          vendor_responded_at: string | null
          vendor_response: string | null
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          product_id: string
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          user_id: string
          vendor_responded_at?: string | null
          vendor_response?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          user_id?: string
          vendor_responded_at?: string | null
          vendor_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          company_id: string
          cost_price: number | null
          created_at: string
          description_ar: string
          external_id: string
          id: string
          image_url: string | null
          low_stock_threshold: number
          map_price: number | null
          minimum_order: number
          name_ar: string
          pack_size: number
          pharmacy_price: number | null
          points_per_unit: number
          price_mad: number
          price_tiers: Json
          rrp_price: number | null
          sku: string | null
          source: string
          stock: number | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          company_id: string
          cost_price?: number | null
          created_at?: string
          description_ar?: string
          external_id: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          map_price?: number | null
          minimum_order?: number
          name_ar: string
          pack_size?: number
          pharmacy_price?: number | null
          points_per_unit?: number
          price_mad: number
          price_tiers?: Json
          rrp_price?: number | null
          sku?: string | null
          source?: string
          stock?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          company_id?: string
          cost_price?: number | null
          created_at?: string
          description_ar?: string
          external_id?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          map_price?: number | null
          minimum_order?: number
          name_ar?: string
          pack_size?: number
          pharmacy_price?: number | null
          points_per_unit?: number
          price_mad?: number
          price_tiers?: Json
          rrp_price?: number | null
          sku?: string | null
          source?: string
          stock?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          address_notes: string | null
          avatar_url: string | null
          city: string | null
          company_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          loyalty_points: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_notes?: string | null
          avatar_url?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          loyalty_points?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_notes?: string | null
          avatar_url?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          loyalty_points?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          payment_method: string
          payment_reference: string | null
          period_end: string
          period_start: string
          plan_id: string
          plan_name: string
          status: string
          subscription_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_method?: string
          payment_reference?: string | null
          period_end: string
          period_start?: string
          plan_id: string
          plan_name: string
          status?: string
          subscription_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_method?: string
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string
          plan_name?: string
          status?: string
          subscription_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          features: Json
          id: string
          max_clients: number | null
          max_products: number | null
          max_users: number | null
          monthly_price: number
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          max_clients?: number | null
          max_products?: number | null
          max_users?: number | null
          monthly_price?: number
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          max_clients?: number | null
          max_products?: number | null
          max_users?: number | null
          monthly_price?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      super_admin_login_attempts: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          company_id: string
          consumer_key: string
          consumer_secret: string
          created_at: string
          domain: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          company_id: string
          consumer_key: string
          consumer_secret: string
          created_at?: string
          domain: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          company_id?: string
          consumer_key?: string
          consumer_secret?: string
          created_at?: string
          domain?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_enabled: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reviews: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          order_id: string | null
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
          user_id: string
          vendor_responded_at: string | null
          vendor_response: string | null
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          user_id: string
          vendor_responded_at?: string | null
          vendor_response?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          user_id?: string
          vendor_responded_at?: string | null
          vendor_response?: string | null
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          city: string | null
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          message: string
          metadata: Json
          next_attempt_at: string
          notification_id: string | null
          phone: string
          recipient_role: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          message: string
          metadata?: Json
          next_attempt_at?: string
          notification_id?: string | null
          phone: string
          recipient_role: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          message?: string
          metadata?: Json
          next_attempt_at?: string
          notification_id?: string | null
          phone?: string
          recipient_role?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: []
      }
      woo_webhook_deliveries: {
        Row: {
          delivery_id: string
          error: string | null
          id: string
          payload_hash: string | null
          processed_at: string | null
          received_at: string
          resource_id: string | null
          status: string
          supplier_id: string
          topic: string | null
        }
        Insert: {
          delivery_id: string
          error?: string | null
          id?: string
          payload_hash?: string | null
          processed_at?: string | null
          received_at?: string
          resource_id?: string | null
          status?: string
          supplier_id: string
          topic?: string | null
        }
        Update: {
          delivery_id?: string
          error?: string | null
          id?: string
          payload_hash?: string | null
          processed_at?: string | null
          received_at?: string
          resource_id?: string | null
          status?: string
          supplier_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "woo_webhook_deliveries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_company_daily_sales: {
        Row: {
          company_id: string | null
          day: string | null
          orders_count: number | null
          revenue_mad: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_company_revenue_30d: {
        Row: {
          avg_order_value: number | null
          company_id: string | null
          last_order_at: string | null
          orders_count: number | null
          revenue_mad: number | null
          unique_buyers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_company_top_products_30d: {
        Row: {
          company_id: string | null
          orders_count: number | null
          product_id: string | null
          revenue_mad: number | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activity_counts: {
        Args: { p_company_id: string; p_snapshot: string }
        Returns: {
          count: number
          entity_type: string
        }[]
      }
      adjust_product_stock: {
        Args: { _delta: number; _product_id: string }
        Returns: boolean
      }
      admin_exists: { Args: never; Returns: boolean }
      analytics_ab_results: {
        Args: { _days?: number }
        Returns: {
          assignments: number
          conversion_rate: number
          conversions: number
          experiment: string
          variant: string
        }[]
      }
      analytics_alerts: {
        Args: { _days?: number; _vendor_id?: string }
        Returns: {
          abandonment_rate: number
          add_to_cart: number
          alert_type: string
          cart_rate: number
          checkout_started: number
          completed: number
          conversion_rate: number
          product_id: string
          severity: string
          vendor_id: string
          views: number
        }[]
      }
      analytics_checkout_funnel: {
        Args: { _days?: number; _vendor_id?: string }
        Returns: Json
      }
      analytics_client_growth: {
        Args: { _days?: number }
        Returns: {
          conversion_rate: number
          dashboard_views: number
          orders: number
          quick_action_clicks: number
          recommendation_clicks: number
          reorder_clicks: number
        }[]
      }
      analytics_integrity_report: {
        Args: never
        Returns: {
          duplicate_events: number
          duplicate_groups: number
          event_name: string
          missing_product: number
          missing_vendor: number
          total: number
        }[]
      }
      analytics_orders_vs_events: {
        Args: { p_days?: number }
        Returns: {
          checkout_completed_events: number
          diff: number
          orders_count: number
          product_views: number
          real_conversion_pct: number
        }[]
      }
      analytics_product_conversion: {
        Args: { _days?: number; _vendor_id?: string }
        Returns: {
          add_to_cart: number
          completed: number
          conversion_rate: number
          product_id: string
          views: number
        }[]
      }
      analytics_recent_events: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          event_name: string
          id: string
          metadata: Json
          price: number
          product_id: string
          user_id: string
          vendor_id: string
        }[]
      }
      analytics_vendor_orders: {
        Args: { _days?: number }
        Returns: {
          orders_count: number
          revenue_mad: number
          vendor_id: string
        }[]
      }
      analytics_vendor_product_stats: {
        Args: { _days?: number; _vendor_id: string }
        Returns: {
          add_to_cart: number
          cart_rate: number
          checkout_started: number
          completed: number
          conversion_rate: number
          exits_before_cart: number
          product_id: string
          views: number
        }[]
      }
      assert_tenant_admin_invariant: {
        Args: never
        Returns: {
          company_id: string
          vendor_count: number
        }[]
      }
      claim_client_role: { Args: never; Returns: boolean }
      claim_whatsapp_outbox: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          company_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          message: string
          metadata: Json
          next_attempt_at: string
          notification_id: string | null
          phone: string
          recipient_role: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_company_id: { Args: never; Returns: string }
      default_warehouse_for_company: {
        Args: { _company_id: string }
        Returns: string
      }
      get_company_daily_sales: {
        Args: { _days?: number }
        Returns: {
          day: string
          orders_count: number
          revenue_mad: number
        }[]
      }
      get_company_plan_limits: {
        Args: { _company_id: string }
        Returns: {
          max_clients: number
          max_products: number
          max_users: number
        }[]
      }
      get_company_revenue_30d: {
        Args: never
        Returns: {
          avg_order_value: number
          last_order_at: string
          orders_count: number
          revenue_mad: number
          unique_buyers: number
        }[]
      }
      get_company_top_products_30d: {
        Args: { _limit?: number }
        Returns: {
          orders_count: number
          product_id: string
          revenue_mad: number
          units_sold: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_phone_ma: { Args: { _raw: string }; Returns: string }
      product_reviews_page:
        | {
            Args: {
              _cursor_created_at?: string
              _cursor_id?: string
              _cursor_rating?: number
              _limit?: number
              _product_id: string
              _sort?: string
            }
            Returns: {
              author_avatar_url: string
              author_name: string
              body: string
              created_at: string
              id: string
              order_id: string
              rating: number
              title: string
              user_id: string
            }[]
          }
        | {
            Args: {
              _cursor_created_at?: string
              _cursor_id?: string
              _cursor_rating?: number
              _limit?: number
              _max_rating?: number
              _min_rating?: number
              _product_id: string
              _sort?: string
            }
            Returns: {
              author_avatar_url: string
              author_name: string
              body: string
              created_at: string
              id: string
              order_id: string
              rating: number
              title: string
              user_id: string
            }[]
          }
      product_reviews_summary: { Args: { _product_id: string }; Returns: Json }
      product_trust_signals: { Args: { _product_id: string }; Returns: Json }
      provision_company: {
        Args: {
          _admin_user_id: string
          _brand_color?: string
          _display_name: string
          _logo_url?: string
          _name: string
        }
        Returns: string
      }
      provision_company_with_admin: {
        Args: {
          _admin_email: string
          _admin_full_name: string
          _admin_password: string
          _brand_color?: string
          _display_name: string
          _name: string
        }
        Returns: Json
      }
      public_signup_company: {
        Args: {
          _admin_email: string
          _admin_full_name: string
          _admin_password: string
          _brand_color?: string
          _company_name: string
          _company_slug: string
        }
        Returns: Json
      }
      refresh_reporting_views: { Args: never; Returns: undefined }
      simulate_subscription_payment: {
        Args: { p_plan_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "distributor"
        | "super_admin"
        | "buyer"
        | "seller"
        | "sales_agent"
        | "partner"
        | "vendor"
        | "client"
      company_type:
        | "pharmacy"
        | "supplements"
        | "herbs"
        | "medical_supplies"
        | "sports_supplies"
        | "other"
      inventory_movement_type:
        | "purchase"
        | "sale"
        | "reservation"
        | "release"
        | "adjustment"
        | "transfer"
        | "return"
      invoice_status: "draft" | "issued" | "paid" | "cancelled" | "overdue"
      order_payment_method:
        | "manual"
        | "cod"
        | "bank_transfer"
        | "card"
        | "stripe"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "processing"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "card"
        | "stripe"
        | "manual"
        | "cod"
      payment_status:
        | "pending"
        | "awaiting_confirmation"
        | "paid"
        | "failed"
        | "refunded"
      review_status: "pending" | "approved" | "rejected"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "distributor",
        "super_admin",
        "buyer",
        "seller",
        "sales_agent",
        "partner",
        "vendor",
        "client",
      ],
      company_type: [
        "pharmacy",
        "supplements",
        "herbs",
        "medical_supplies",
        "sports_supplies",
        "other",
      ],
      inventory_movement_type: [
        "purchase",
        "sale",
        "reservation",
        "release",
        "adjustment",
        "transfer",
        "return",
      ],
      invoice_status: ["draft", "issued", "paid", "cancelled", "overdue"],
      order_payment_method: [
        "manual",
        "cod",
        "bank_transfer",
        "card",
        "stripe",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
        "processing",
      ],
      payment_method: [
        "cash",
        "bank_transfer",
        "card",
        "stripe",
        "manual",
        "cod",
      ],
      payment_status: [
        "pending",
        "awaiting_confirmation",
        "paid",
        "failed",
        "refunded",
      ],
      review_status: ["pending", "approved", "rejected"],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
    },
  },
} as const
