CREATE TYPE "public"."game_status" AS ENUM('ACTIVE', 'COMPLETED', 'FAILED', 'FORFEITED');--> statement-breakpoint
CREATE TYPE "public"."puzzle_status" AS ENUM('SCHEDULED', 'ACTIVE', 'FINALIZED');--> statement-breakpoint
CREATE TABLE "answer_dictionary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"normalized_word" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puzzle_date" date NOT NULL,
	"answer_id" uuid NOT NULL,
	"hint_letter" text NOT NULL,
	"status" "puzzle_status" DEFAULT 'SCHEDULED' NOT NULL,
	"locked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"average_completion_time_ms" integer,
	"non_completion_penalty_ms" integer,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hint_letter_shape" CHECK (char_length("daily_puzzles"."hint_letter") = 1 AND "daily_puzzles"."hint_letter" ~ '^[A-Z]$')
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" uuid NOT NULL,
	"status" "game_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completion_time_ms" integer,
	"guess_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"guess_number" integer NOT NULL,
	"word" text NOT NULL,
	"feedback" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"avatar_emoji" text DEFAULT '🙂' NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"display_name_normalized" text,
	"onboarding_completed_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_display_name_normalized_unique" UNIQUE("display_name_normalized")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_answer_id_answer_dictionary_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answer_dictionary"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guesses" ADD CONSTRAINT "guesses_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_dictionary_word_uidx" ON "answer_dictionary" USING btree ("word");--> statement-breakpoint
CREATE UNIQUE INDEX "answer_dictionary_normalized_word_uidx" ON "answer_dictionary" USING btree ("normalized_word");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_puzzles_puzzle_date_uidx" ON "daily_puzzles" USING btree ("puzzle_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_puzzles_answer_id_uidx" ON "daily_puzzles" USING btree ("answer_id");--> statement-breakpoint
CREATE INDEX "daily_puzzles_status_date_idx" ON "daily_puzzles" USING btree ("status","puzzle_date");--> statement-breakpoint
CREATE UNIQUE INDEX "games_user_puzzle_uidx" ON "games" USING btree ("user_id","puzzle_id");--> statement-breakpoint
CREATE INDEX "games_puzzle_status_idx" ON "games" USING btree ("puzzle_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "guesses_game_number_uidx" ON "guesses" USING btree ("game_id","guess_number");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");