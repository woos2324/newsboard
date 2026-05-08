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
      ai_summary: {
        Row: {
          ai_summary_id: number
          content: string
          created_at: string
          created_by_user_id: number | null
          issue_cluster_id: number | null
          model_version: string
          quality_score: number | null
          source_metadata: Json | null
          summary_date: string
          summary_type: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_summary_id?: number
          content: string
          created_at?: string
          created_by_user_id?: number | null
          issue_cluster_id?: number | null
          model_version: string
          quality_score?: number | null
          source_metadata?: Json | null
          summary_date: string
          summary_type: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_summary_id?: number
          content?: string
          created_at?: string
          created_by_user_id?: number | null
          issue_cluster_id?: number | null
          model_version?: string
          quality_score?: number | null
          source_metadata?: Json | null
          summary_date?: string
          summary_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summary_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_summary_issue_cluster_id_fkey"
            columns: ["issue_cluster_id"]
            isOneToOne: false
            referencedRelation: "issue_cluster"
            referencedColumns: ["issue_cluster_id"]
          },
        ]
      }
      app_user: {
        Row: {
          created_at: string
          email: string
          is_active: boolean
          last_login_at: string | null
          name: string
          role: string
          updated_at: string
          user_id: number
        }
        Insert: {
          created_at?: string
          email: string
          is_active?: boolean
          last_login_at?: string | null
          name: string
          role: string
          updated_at?: string
          user_id?: number
        }
        Update: {
          created_at?: string
          email?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          role?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: []
      }
      article: {
        Row: {
          article_id: number
          author_name: string | null
          body: string | null
          category: string | null
          collected_at: string
          content_hash: string | null
          created_at: string
          external_article_id: string | null
          media_company_id: number
          published_at: string | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          article_id?: number
          author_name?: string | null
          body?: string | null
          category?: string | null
          collected_at?: string
          content_hash?: string | null
          created_at?: string
          external_article_id?: string | null
          media_company_id: number
          published_at?: string | null
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          article_id?: number
          author_name?: string | null
          body?: string | null
          category?: string | null
          collected_at?: string
          content_hash?: string | null
          created_at?: string
          external_article_id?: string | null
          media_company_id?: number
          published_at?: string | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_media_company_id_fkey"
            columns: ["media_company_id"]
            isOneToOne: false
            referencedRelation: "media_company"
            referencedColumns: ["media_company_id"]
          },
        ]
      }
      comment_metric: {
        Row: {
          article_id: number
          comment_count: number
          comment_metric_id: number
          created_at: string
          engagement_score: number | null
          like_count: number | null
          measured_at: string
          reply_count: number | null
          source: string
        }
        Insert: {
          article_id: number
          comment_count: number
          comment_metric_id?: number
          created_at?: string
          engagement_score?: number | null
          like_count?: number | null
          measured_at: string
          reply_count?: number | null
          source: string
        }
        Update: {
          article_id?: number
          comment_count?: number
          comment_metric_id?: number
          created_at?: string
          engagement_score?: number | null
          like_count?: number | null
          measured_at?: string
          reply_count?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_metric_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "article"
            referencedColumns: ["article_id"]
          },
        ]
      }
      daily_publication_count: {
        Row: {
          created_at: string
          daily_publication_count_id: number
          media_company_id: number
          publication_count: number
          snapshot_date: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_publication_count_id?: number
          media_company_id: number
          publication_count: number
          snapshot_date: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_publication_count_id?: number
          media_company_id?: number
          publication_count?: number
          snapshot_date?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_publication_count_media_company_id_fkey"
            columns: ["media_company_id"]
            isOneToOne: false
            referencedRelation: "media_company"
            referencedColumns: ["media_company_id"]
          },
        ]
      }
      issue_cluster: {
        Row: {
          cluster_date: string
          cluster_key: string
          confidence_score: number | null
          created_at: string
          issue_cluster_id: number
          keywords: string[] | null
          model_version: string
          representative_title: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          cluster_date: string
          cluster_key: string
          confidence_score?: number | null
          created_at?: string
          issue_cluster_id?: number
          keywords?: string[] | null
          model_version: string
          representative_title: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          cluster_date?: string
          cluster_key?: string
          confidence_score?: number | null
          created_at?: string
          issue_cluster_id?: number
          keywords?: string[] | null
          model_version?: string
          representative_title?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      issue_cluster_article: {
        Row: {
          article_id: number
          created_at: string
          is_representative: boolean
          issue_cluster_article_id: number
          issue_cluster_id: number
          similarity_score: number | null
        }
        Insert: {
          article_id: number
          created_at?: string
          is_representative?: boolean
          issue_cluster_article_id?: number
          issue_cluster_id: number
          similarity_score?: number | null
        }
        Update: {
          article_id?: number
          created_at?: string
          is_representative?: boolean
          issue_cluster_article_id?: number
          issue_cluster_id?: number
          similarity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "issue_cluster_article_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "article"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "issue_cluster_article_issue_cluster_id_fkey"
            columns: ["issue_cluster_id"]
            isOneToOne: false
            referencedRelation: "issue_cluster"
            referencedColumns: ["issue_cluster_id"]
          },
        ]
      }
      media_company: {
        Row: {
          created_at: string
          homepage_url: string | null
          is_active: boolean
          is_our_company: boolean
          media_company_id: number
          name: string
          naver_media_id: string | null
          normalized_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          homepage_url?: string | null
          is_active?: boolean
          is_our_company?: boolean
          media_company_id?: number
          name: string
          naver_media_id?: string | null
          normalized_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          homepage_url?: string | null
          is_active?: boolean
          is_our_company?: boolean
          media_company_id?: number
          name?: string
          naver_media_id?: string | null
          normalized_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      missed_issue_alert: {
        Row: {
          alert_status: string
          competitor_article_count: number
          created_at: string
          detected_at: string
          issue_cluster_id: number
          missed_issue_alert_id: number
          priority_score: number | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by_user_id: number | null
          similar_article_id: number | null
          target_media_company_id: number
          verdict: string | null
        }
        Insert: {
          alert_status?: string
          competitor_article_count: number
          created_at?: string
          detected_at?: string
          issue_cluster_id: number
          missed_issue_alert_id?: number
          priority_score?: number | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: number | null
          similar_article_id?: number | null
          target_media_company_id: number
          verdict?: string | null
        }
        Update: {
          alert_status?: string
          competitor_article_count?: number
          created_at?: string
          detected_at?: string
          issue_cluster_id?: number
          missed_issue_alert_id?: number
          priority_score?: number | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: number | null
          similar_article_id?: number | null
          target_media_company_id?: number
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missed_issue_alert_issue_cluster_id_fkey"
            columns: ["issue_cluster_id"]
            isOneToOne: false
            referencedRelation: "issue_cluster"
            referencedColumns: ["issue_cluster_id"]
          },
          {
            foreignKeyName: "missed_issue_alert_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "missed_issue_alert_similar_article_id_fkey"
            columns: ["similar_article_id"]
            isOneToOne: false
            referencedRelation: "article"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "missed_issue_alert_target_media_company_id_fkey"
            columns: ["target_media_company_id"]
            isOneToOne: false
            referencedRelation: "media_company"
            referencedColumns: ["media_company_id"]
          },
        ]
      }
      ranking_news_item: {
        Row: {
          article_id: number
          created_at: string
          rank_position: number
          ranking_item_id: number
          ranking_snapshot_id: number
          score: number | null
        }
        Insert: {
          article_id: number
          created_at?: string
          rank_position: number
          ranking_item_id?: number
          ranking_snapshot_id: number
          score?: number | null
        }
        Update: {
          article_id?: number
          created_at?: string
          rank_position?: number
          ranking_item_id?: number
          ranking_snapshot_id?: number
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_news_item_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "article"
            referencedColumns: ["article_id"]
          },
          {
            foreignKeyName: "ranking_news_item_ranking_snapshot_id_fkey"
            columns: ["ranking_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ranking_news_snapshot"
            referencedColumns: ["ranking_snapshot_id"]
          },
        ]
      }
      ranking_news_snapshot: {
        Row: {
          category: string | null
          collection_status: string
          created_at: string
          media_company_id: number
          ranking_snapshot_id: number
          snapshot_at: string
          source: string
        }
        Insert: {
          category?: string | null
          collection_status?: string
          created_at?: string
          media_company_id: number
          ranking_snapshot_id?: number
          snapshot_at: string
          source: string
        }
        Update: {
          category?: string | null
          collection_status?: string
          created_at?: string
          media_company_id?: number
          ranking_snapshot_id?: number
          snapshot_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_news_snapshot_media_company_id_fkey"
            columns: ["media_company_id"]
            isOneToOne: false
            referencedRelation: "media_company"
            referencedColumns: ["media_company_id"]
          },
        ]
      }
      section_ranking_snapshot: {
        Row: {
          collected_at: string
          media_company_id: number
          rank: number
          ranking_date: string
          section_name: string
          snapshot_id: number
          title: string
          url: string | null
        }
        Insert: {
          collected_at?: string
          media_company_id: number
          rank: number
          ranking_date: string
          section_name: string
          snapshot_id?: number
          title: string
          url?: string | null
        }
        Update: {
          collected_at?: string
          media_company_id?: number
          rank?: number
          ranking_date?: string
          section_name?: string
          snapshot_id?: number
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_ranking_snapshot_media_company_id_fkey"
            columns: ["media_company_id"]
            isOneToOne: false
            referencedRelation: "media_company"
            referencedColumns: ["media_company_id"]
          },
        ]
      }
      subscriber_snapshot: {
        Row: {
          created_at: string
          daily_delta: number | null
          media_company_id: number
          seven_day_delta: number | null
          snapshot_date: string
          source: string
          subscriber_count: number
          subscriber_snapshot_id: number
        }
        Insert: {
          created_at?: string
          daily_delta?: number | null
          media_company_id: number
          seven_day_delta?: number | null
          snapshot_date: string
          source: string
          subscriber_count: number
          subscriber_snapshot_id?: number
        }
        Update: {
          created_at?: string
          daily_delta?: number | null
          media_company_id?: number
          seven_day_delta?: number | null
          snapshot_date?: string
          source?: string
          subscriber_count?: number
          subscriber_snapshot_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriber_snapshot_media_company_id_fkey"
            columns: ["media_company_id"]
            isOneToOne: false
            referencedRelation: "media_company"
            referencedColumns: ["media_company_id"]
          },
        ]
      }
      trending_keyword: {
        Row: {
          approx_traffic: string
          fetched_at: string
          keyword: string
          matched_cluster_id: number | null
          related_news: Json | null
          traffic_rank: number
          trending_id: number
        }
        Insert: {
          approx_traffic: string
          fetched_at?: string
          keyword: string
          matched_cluster_id?: number | null
          related_news?: Json | null
          traffic_rank: number
          trending_id?: number
        }
        Update: {
          approx_traffic?: string
          fetched_at?: string
          keyword?: string
          matched_cluster_id?: number | null
          related_news?: Json | null
          traffic_rank?: number
          trending_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
