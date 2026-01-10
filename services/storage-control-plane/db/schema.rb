# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_01_10_000002) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "access_policies", force: :cascade do |t|
    t.bigint "bucket_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "policy", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["bucket_id"], name: "index_access_policies_on_bucket_id", unique: true
  end

  create_table "accounts", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "plan", default: "free", null: false
    t.datetime "updated_at", null: false
  end

  create_table "api_keys", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.datetime "created_at", null: false
    t.string "key_hash", null: false
    t.string "name", null: false
    t.jsonb "scopes", default: {}, null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id", "name"], name: "index_api_keys_on_account_id_and_name", unique: true
    t.index ["account_id"], name: "index_api_keys_on_account_id"
    t.index ["key_hash"], name: "index_api_keys_on_key_hash", unique: true
  end

  create_table "buckets", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "default_encryption", default: {}, null: false
    t.string "name", null: false
    t.string "region", null: false
    t.datetime "updated_at", null: false
    t.string "versioning", default: "suspended", null: false
    t.index ["account_id"], name: "index_buckets_on_account_id"
    t.index ["name"], name: "index_buckets_on_name", unique: true
  end

  create_table "events", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.bigint "bucket_id", null: false
    t.datetime "created_at", null: false
    t.string "event_type", null: false
    t.string "object_key"
    t.jsonb "payload", default: {}, null: false
    t.datetime "processed_at"
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_events_on_account_id"
    t.index ["bucket_id", "created_at"], name: "index_events_on_bucket_id_and_created_at"
    t.index ["bucket_id"], name: "index_events_on_bucket_id"
    t.index ["event_type"], name: "index_events_on_event_type"
    t.index ["processed_at"], name: "index_events_on_processed_at"
  end

  create_table "multipart_parts", force: :cascade do |t|
    t.string "checksum"
    t.jsonb "chunk_manifest", default: {}, null: false
    t.datetime "created_at", null: false
    t.string "etag"
    t.bigint "multipart_upload_id", null: false
    t.integer "part_number", null: false
    t.bigint "size"
    t.string "status", default: "uploaded", null: false
    t.datetime "updated_at", null: false
    t.index ["multipart_upload_id", "part_number"], name: "index_multipart_parts_on_multipart_upload_id_and_part_number", unique: true
    t.index ["multipart_upload_id"], name: "index_multipart_parts_on_multipart_upload_id"
  end

  create_table "multipart_uploads", force: :cascade do |t|
    t.bigint "bucket_id", null: false
    t.datetime "created_at", null: false
    t.string "initiated_by"
    t.string "key", null: false
    t.integer "part_size", default: 5242880, null: false
    t.string "status", default: "initiated", null: false
    t.datetime "updated_at", null: false
    t.string "upload_id", null: false
    t.index ["bucket_id", "key", "status"], name: "index_multipart_uploads_on_bucket_id_and_key_and_status"
    t.index ["bucket_id", "upload_id"], name: "index_multipart_uploads_on_bucket_id_and_upload_id", unique: true
    t.index ["bucket_id"], name: "index_multipart_uploads_on_bucket_id"
  end

  create_table "object_versions", force: :cascade do |t|
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "etag"
    t.jsonb "manifest", default: {}, null: false
    t.jsonb "metadata", default: {}, null: false
    t.bigint "size"
    t.string "status", default: "pending", null: false
    t.bigint "storage_object_id", null: false
    t.datetime "updated_at", null: false
    t.string "version", null: false
    t.index ["etag"], name: "index_object_versions_on_etag"
    t.index ["storage_object_id", "version"], name: "index_object_versions_on_storage_object_id_and_version", unique: true
    t.index ["storage_object_id"], name: "index_object_versions_on_storage_object_id"
  end

  create_table "settings", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.boolean "secret", default: false
    t.datetime "updated_at", null: false
    t.text "value"
    t.index ["account_id", "key"], name: "index_settings_on_account_id_and_key", unique: true
    t.index ["account_id"], name: "index_settings_on_account_id"
  end

  create_table "storage_objects", force: :cascade do |t|
    t.bigint "bucket_id", null: false
    t.datetime "created_at", null: false
    t.bigint "current_version_id"
    t.boolean "deleted_marker", default: false, null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.index ["bucket_id", "key"], name: "index_storage_objects_on_bucket_id_and_key", unique: true
    t.index ["bucket_id"], name: "index_storage_objects_on_bucket_id"
    t.index ["current_version_id"], name: "index_storage_objects_on_current_version_id"
  end

  create_table "users", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.datetime "created_at", null: false
    t.string "password_digest", null: false
    t.string "role", default: "user"
    t.string "session_token"
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["account_id"], name: "index_users_on_account_id"
    t.index ["session_token"], name: "index_users_on_session_token", unique: true
    t.index ["username"], name: "index_users_on_username", unique: true
  end

  add_foreign_key "access_policies", "buckets"
  add_foreign_key "api_keys", "accounts"
  add_foreign_key "buckets", "accounts"
  add_foreign_key "events", "accounts"
  add_foreign_key "events", "buckets"
  add_foreign_key "multipart_parts", "multipart_uploads"
  add_foreign_key "multipart_uploads", "buckets"
  add_foreign_key "object_versions", "storage_objects"
  add_foreign_key "settings", "accounts"
  add_foreign_key "storage_objects", "buckets"
  add_foreign_key "storage_objects", "object_versions", column: "current_version_id", on_delete: :nullify
  add_foreign_key "users", "accounts"
end
