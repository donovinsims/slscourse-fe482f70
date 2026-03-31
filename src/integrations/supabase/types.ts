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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          customer_id: string
          event_type: string
          id: string
          ip_address: string | null
          video_id: string
          watched_at: string
        }
        Insert: {
          customer_id: string
          event_type: string
          id?: string
          ip_address?: string | null
          video_id: string
          watched_at?: string
        }
        Update: {
          customer_id?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          video_id?: string
          watched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          access_expires_at: string | null
          auth_linked_at: string | null
          auth_user_id: string | null
          course_access: boolean
          email: string
          id: string
          purchased_at: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          access_expires_at?: string | null
          auth_linked_at?: string | null
          auth_user_id?: string | null
          course_access?: boolean
          email: string
          id?: string
          purchased_at?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          access_expires_at?: string | null
          auth_linked_at?: string | null
          auth_user_id?: string | null
          course_access?: boolean
          email?: string
          id?: string
          purchased_at?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      stripe_checkout_fulfillments: {
        Row: {
          access_granted_at: string | null
          auth_user_id: string | null
          created_at: string
          customer_email: string
          customer_id: string | null
          failure_reason: string | null
          magic_link_generated_at: string | null
          payment_intent_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_event_id: string | null
          stripe_session_id: string
          updated_at: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          access_granted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          customer_email: string
          customer_id?: string | null
          failure_reason?: string | null
          magic_link_generated_at?: string | null
          payment_intent_id?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_session_id: string
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          access_granted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          customer_email?: string
          customer_id?: string | null
          failure_reason?: string | null
          magic_link_generated_at?: string | null
          payment_intent_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_session_id?: string
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_checkout_fulfillments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      video_sessions: {
        Row: {
          created_at: string
          customer_id: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          ip_address: string | null
          session_token: string
          used: boolean
          video_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          device_fingerprint?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          session_token: string
          used?: boolean
          video_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          session_token?: string
          used?: boolean
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_sessions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          description: string
          id: string
          module: string
          sort_order: number
          summary: string
          title: string
          transcript: string
          youtube_id: string
        }
        Insert: {
          description?: string
          id?: string
          module: string
          sort_order: number
          summary?: string
          title: string
          transcript?: string
          youtube_id: string
        }
        Update: {
          description?: string
          id?: string
          module?: string
          sort_order?: number
          summary?: string
          title?: string
          transcript?: string
          youtube_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_customer_for_auth_user: {
        Args: { p_auth_user_id: string; p_email: string }
        Returns: {
          auth_user_id: string
          course_access: boolean
          email: string
          id: string
        }[]
      }
      get_course_videos: {
        Args: never
        Returns: {
          description: string
          id: string
          module: string
          sort_order: number
          summary: string
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
