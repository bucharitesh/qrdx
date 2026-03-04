import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export interface ThemeStyles {
  // Define your theme styles type here
  // This should match the type from your app
  [key: string]: any;
}

export interface UserSettings {
  keyboardShortcuts: boolean;
  // Add more settings here in the future
}

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  settings: json("settings").$type<UserSettings>().default({
    keyboardShortcuts: true,
  }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const qrPreset = pgTable("qr_preset", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  style: json("style").$type<ThemeStyles>().notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const aiUsage = pgTable("ai_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  promptTokens: text("prompt_tokens").notNull().default("0"),
  completionTokens: text("completion_tokens").notNull().default("0"),
  daysSinceEpoch: text("days_since_epoch").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
  modifiedAt: timestamp("modified_at"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  recurringInterval: text("recurring_interval").notNull(),
  status: text("status").notNull(),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at"),
  startedAt: timestamp("started_at").notNull(),
  endsAt: timestamp("ends_at"),
  endedAt: timestamp("ended_at"),
  customerId: text("customer_id").notNull(),
  productId: text("product_id").notNull(),
  discountId: text("discount_id"),
  checkoutId: text("checkout_id").notNull(),
  customerCancellationReason: text("customer_cancellation_reason"),
  customerCancellationComment: text("customer_cancellation_comment"),
  metadata: text("metadata"), // JSON string
  customFieldData: text("custom_field_data"), // JSON string
  userId: text("user_id").references(() => user.id),
});

export const integration = pgTable("integration", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "dub", "google-analytics", "stripe", etc.
  accessToken: text("access_token").notNull(), // encrypted
  refreshToken: text("refresh_token"), // encrypted, nullable for non-OAuth flows
  expiresAt: timestamp("expires_at"), // when access token expires
  scopes: text("scopes"), // comma-separated OAuth scopes
  metadata: json("metadata"), // provider-specific data (workspace info, etc.)
  status: text("status").notNull().default("active"), // "active", "disconnected", "error"
  lastSyncAt: timestamp("last_sync_at"), // when integration was last used
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const communityTheme = pgTable(
  "community_theme",
  {
    id: text("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .unique()
      .references(() => qrPreset.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at").notNull(),
  },
  (table) => [index("community_theme_published_at_idx").on(table.publishedAt)]
);

export const communityThemeTag = pgTable(
  "community_theme_tag",
  {
    communityThemeId: text("community_theme_id")
      .notNull()
      .references(() => communityTheme.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.communityThemeId, table.tag] }),
    index("community_theme_tag_tag_idx").on(table.tag),
  ]
);

export const themeLike = pgTable(
  "theme_like",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    themeId: text("theme_id")
      .notNull()
      .references(() => communityTheme.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.themeId] })]
);
