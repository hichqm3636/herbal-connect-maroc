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
      companies: {
        Row: {
          brand_color: string
          created_at: string
          display_name: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          brand_color?: string
          created_at?: string
          display_name?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          brand_color?: string
          created_at?: string
          display_name?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_distributor_pricing: {
        Row: {
          company_id: string
          created_at: string
          custom_discount_percent: number | null
          distributor_id: string
          id: string
          pricing_tier_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_discount_percent?: number | null
          distributor_id: string
          id?: string
          pricing_tier_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_discount_percent?: number | null
          distributor_id?: string
          id?: string
          pricing_tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cdp_pricing_tier_fk"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_distributor_pricing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_distributor_pricing_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      distributor_territories: {
        Row: {
          company_id: string
          created_at: string
          distributor_id: string
          id: string
          territory_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          distributor_id: string
          id?: string
          territory_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          distributor_id?: string
          id?: string
          territory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_territories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_territories_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_territories_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
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
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          distributor_id: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          issued_at: string | null
          notes: string | null
          order_id: string
          paid_at: string | null
          payment_method: string | null
          pdf_path: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_mad: number
          total_mad: number
          updated_at: string
          vat_amount_mad: number
          vat_rate: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          distributor_id: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          issued_at?: string | null
          notes?: string | null
          order_id: string
          paid_at?: string | null
          payment_method?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_mad?: number
          total_mad?: number
          updated_at?: string
          vat_amount_mad?: number
          vat_rate?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          distributor_id?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          payment_method?: string | null
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
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          admin_id: string | null
          company_id: string
          created_at: string
          distributor_id: string
          id: string
          points: number
          reason: string
        }
        Insert: {
          admin_id?: string | null
          company_id: string
          created_at?: string
          distributor_id: string
          id?: string
          points: number
          reason?: string
        }
        Update: {
          admin_id?: string | null
          company_id?: string
          created_at?: string
          distributor_id?: string
          id?: string
          points?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      order_rules: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          min_order_amount: number | null
          min_points: number | null
          min_products: number | null
          name: string
          rule_type: string
          tier_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          min_order_amount?: number | null
          min_points?: number | null
          min_products?: number | null
          name: string
          rule_type: string
          tier_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          min_order_amount?: number | null
          min_points?: number | null
          min_products?: number | null
          name?: string
          rule_type?: string
          tier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_rules_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          company_id: string
          created_at: string
          distributor_id: string
          external_id: string | null
          external_status: string | null
          id: string
          notes: string | null
          order_number: string
          payment_method: string | null
          points_earned: number
          status: Database["public"]["Enums"]["order_status"]
          supplier_partner_id: string | null
          sync_error: string | null
          total_mad: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company_id: string
          created_at?: string
          distributor_id: string
          external_id?: string | null
          external_status?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_method?: string | null
          points_earned?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_partner_id?: string | null
          sync_error?: string | null
          total_mad?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company_id?: string
          created_at?: string
          distributor_id?: string
          external_id?: string | null
          external_status?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          points_earned?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_partner_id?: string | null
          sync_error?: string | null
          total_mad?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_distributor_fk"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_partner_id_fkey"
            columns: ["supplier_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          city: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          invite_token: string
          partner_name: string | null
          partner_type: Database["public"]["Enums"]["partner_type"]
          phone: string | null
          status: Database["public"]["Enums"]["partner_invite_status"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          invite_token: string
          partner_name?: string | null
          partner_type: Database["public"]["Enums"]["partner_type"]
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_invite_status"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          invite_token?: string
          partner_name?: string | null
          partner_type?: Database["public"]["Enums"]["partner_type"]
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_invite_status"]
        }
        Relationships: [
          {
            foreignKeyName: "partner_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          city: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["partner_status"]
          type: Database["public"]["Enums"]["partner_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          city?: string | null
          company_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          type: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_company_id_fkey"
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
      pricing_tiers: {
        Row: {
          base_discount_percent: number
          company_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          base_discount_percent?: number
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          base_discount_percent?: number
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_tiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      product_zones: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          zone_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          zone_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_zones_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "territories"
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
          external_id: string | null
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
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          company_id: string
          cost_price?: number | null
          created_at?: string
          description_ar?: string
          external_id?: string | null
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
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          company_id?: string
          cost_price?: number | null
          created_at?: string
          description_ar?: string
          external_id?: string | null
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
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["partner_type"]
          avatar_url: string | null
          city: string | null
          company_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          level: Database["public"]["Enums"]["distributor_level"]
          loyalty_points: number
          monthly_sales: number
          parent_distributor_id: string | null
          phone: string | null
          territory_id: string
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["partner_type"]
          avatar_url?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["distributor_level"]
          loyalty_points?: number
          monthly_sales?: number
          parent_distributor_id?: string | null
          phone?: string | null
          territory_id: string
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["partner_type"]
          avatar_url?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["distributor_level"]
          loyalty_points?: number
          monthly_sales?: number
          parent_distributor_id?: string | null
          phone?: string | null
          territory_id?: string
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
          {
            foreignKeyName: "profiles_parent_distributor_id_fkey"
            columns: ["parent_distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_order_templates: {
        Row: {
          company_id: string
          created_at: string
          id: string
          items: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          items?: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          items?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_order_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_agents: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          profile_id: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          profile_id: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agents_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
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
      territories: {
        Row: {
          city: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "territories_company_id_fkey"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _tmp_check_auth_user: {
        Args: { _email: string }
        Returns: {
          created_at: string
          email: string
          id: string
          raw_user_meta_data: Json
        }[]
      }
      accept_partner_invite: {
        Args: { _full_name: string; _token: string }
        Returns: Json
      }
      activity_counts: {
        Args: { p_company_id: string; p_snapshot: string }
        Returns: {
          count: number
          entity_type: string
        }[]
      }
      admin_exists: { Args: never; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      current_company_id: { Args: never; Returns: string }
      default_warehouse_for_company: {
        Args: { _company_id: string }
        Returns: string
      }
      has_enabled_distributor_role: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      level_for_points: {
        Args: { pts: number }
        Returns: Database["public"]["Enums"]["distributor_level"]
      }
      partner_invite_info: {
        Args: { _token: string }
        Returns: {
          company_brand_color: string
          company_display_name: string
          company_id: string
          company_name: string
          email: string
          expires_at: string
          partner_name: string
          partner_type: Database["public"]["Enums"]["partner_type"]
          status: Database["public"]["Enums"]["partner_invite_status"]
        }[]
      }
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
      reset_monthly_sales: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "distributor"
        | "super_admin"
        | "buyer"
        | "seller"
        | "sales_agent"
      distributor_level:
        | "distributor"
        | "senior_consultant"
        | "success_builder"
        | "supervisor"
        | "world_team"
      inventory_movement_type:
        | "purchase"
        | "sale"
        | "reservation"
        | "release"
        | "adjustment"
        | "transfer"
        | "return"
      invoice_status: "draft" | "issued" | "paid" | "cancelled" | "overdue"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "processing"
      partner_invite_status: "pending" | "accepted" | "expired"
      partner_status: "invited" | "active" | "suspended"
      partner_type:
        | "pharmacy"
        | "parapharmacy"
        | "distributor"
        | "master_distributor"
        | "gym"
      payment_method: "cash" | "bank_transfer" | "card" | "stripe" | "manual"
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
      ],
      distributor_level: [
        "distributor",
        "senior_consultant",
        "success_builder",
        "supervisor",
        "world_team",
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
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
        "processing",
      ],
      partner_invite_status: ["pending", "accepted", "expired"],
      partner_status: ["invited", "active", "suspended"],
      partner_type: [
        "pharmacy",
        "parapharmacy",
        "distributor",
        "master_distributor",
        "gym",
      ],
      payment_method: ["cash", "bank_transfer", "card", "stripe", "manual"],
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
