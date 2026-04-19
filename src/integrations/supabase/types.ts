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
          updated_at: string
        }
        Insert: {
          brand_color?: string
          created_at?: string
          display_name?: string
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          brand_color?: string
          created_at?: string
          display_name?: string
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          company_id: string
          created_at: string
          distributor_id: string
          id: string
          notes: string | null
          order_number: string
          points_earned: number
          status: Database["public"]["Enums"]["order_status"]
          total_mad: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company_id: string
          created_at?: string
          distributor_id: string
          id?: string
          notes?: string | null
          order_number: string
          points_earned?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_mad?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company_id?: string
          created_at?: string
          distributor_id?: string
          id?: string
          notes?: string | null
          order_number?: string
          points_earned?: number
          status?: Database["public"]["Enums"]["order_status"]
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
        ]
      }
      pricing_tiers: {
        Row: {
          company_id: string
          created_at: string
          discount_percentage: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          discount_percentage?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          discount_percentage?: number
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
      products: {
        Row: {
          active: boolean
          category: string | null
          company_id: string
          cost: number | null
          created_at: string
          description_ar: string
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
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          company_id: string
          cost?: number | null
          created_at?: string
          description_ar?: string
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
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          company_id?: string
          cost?: number | null
          created_at?: string
          description_ar?: string
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
          stock?: number
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
          partner_type: Database["public"]["Enums"]["partner_type"]
          phone: string | null
          pricing_tier_id: string | null
          territory_id: string
          updated_at: string
        }
        Insert: {
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
          partner_type?: Database["public"]["Enums"]["partner_type"]
          phone?: string | null
          pricing_tier_id?: string | null
          territory_id: string
          updated_at?: string
        }
        Update: {
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
          partner_type?: Database["public"]["Enums"]["partner_type"]
          phone?: string | null
          pricing_tier_id?: string | null
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
            foreignKeyName: "profiles_pricing_tier_id_fkey"
            columns: ["pricing_tier_id"]
            isOneToOne: false
            referencedRelation: "pricing_tiers"
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
      territories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
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
      admin_exists: { Args: never; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      current_company_id: { Args: never; Returns: string }
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
      reset_monthly_sales: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "distributor" | "super_admin"
      distributor_level:
        | "distributor"
        | "senior_consultant"
        | "success_builder"
        | "supervisor"
        | "world_team"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "shipped"
        | "delivered"
        | "cancelled"
      partner_type:
        | "pharmacy"
        | "parapharmacy"
        | "distributor"
        | "master_distributor"
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
      app_role: ["admin", "distributor", "super_admin"],
      distributor_level: [
        "distributor",
        "senior_consultant",
        "success_builder",
        "supervisor",
        "world_team",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      partner_type: [
        "pharmacy",
        "parapharmacy",
        "distributor",
        "master_distributor",
      ],
    },
  },
} as const
