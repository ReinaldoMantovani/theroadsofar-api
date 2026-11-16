import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Base do CMS (theroadsofar-admin):
 * - artigos: subtítulo, conteúdo em blocos (JSON), destaque, SEO completo, dossiê investigativo,
 *   status REVIEW/TRASH, controle de versão (edição concorrente) e último editor
 * - revisões persistidas, redirecionamento de slugs, visualizações por dia
 * - metadados de mídia (alt, legenda, crédito, IA, tipo, hash para evitar duplicatas)
 * - histórico de gerações de IA e relatos enviados por leitores
 *
 * Incremental: só adiciona colunas/tabelas. Nenhum dado existente é apagado.
 */
export class CmsFoundation1700000000003 implements MigrationInterface {
  name = 'CmsFoundation1700000000003';

  public async up(q: QueryRunner): Promise<void> {
    // ── Artigos ────────────────────────────────────────────────────────
    await q.query(`ALTER TABLE \`articles\`
      MODIFY \`status\` ENUM('DRAFT','REVIEW','PUBLISHED','SCHEDULED','ARCHIVED','TRASH') NOT NULL DEFAULT 'DRAFT',
      ADD COLUMN \`subtitle\` VARCHAR(300) NULL AFTER \`title\`,
      ADD COLUMN \`content_json\` LONGTEXT NULL AFTER \`content_html\`,
      ADD COLUMN \`featured\` TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN \`previous_status\` VARCHAR(20) NULL,
      ADD COLUMN \`trashed_at\` DATETIME NULL,
      ADD COLUMN \`seo_focus_keyword\` VARCHAR(100) NULL,
      ADD COLUMN \`seo_keywords_json\` LONGTEXT NULL,
      ADD COLUMN \`canonical_url\` VARCHAR(500) NULL,
      ADD COLUMN \`og_title\` VARCHAR(100) NULL,
      ADD COLUMN \`og_description\` VARCHAR(200) NULL,
      ADD COLUMN \`og_image_url\` VARCHAR(500) NULL,
      ADD COLUMN \`twitter_card\` VARCHAR(30) NULL,
      ADD COLUMN \`robots_index\` TINYINT(1) NOT NULL DEFAULT 1,
      ADD COLUMN \`classification_level\` VARCHAR(20) NOT NULL DEFAULT 'publico',
      ADD COLUMN \`case_number\` VARCHAR(50) NULL,
      ADD COLUMN \`case_status\` VARCHAR(30) NULL,
      ADD COLUMN \`location_name\` VARCHAR(200) NULL,
      ADD COLUMN \`latitude\` DECIMAL(9,6) NULL,
      ADD COLUMN \`longitude\` DECIMAL(9,6) NULL,
      ADD COLUMN \`phenomenon_type\` VARCHAR(100) NULL,
      ADD COLUMN \`entity_name\` VARCHAR(150) NULL,
      ADD COLUMN \`event_date\` VARCHAR(100) NULL,
      ADD COLUMN \`dossier_summary\` TEXT NULL,
      ADD COLUMN \`is_fiction\` TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN \`censored_json\` LONGTEXT NULL,
      ADD COLUMN \`timeline_json\` LONGTEXT NULL,
      ADD COLUMN \`attachments_json\` LONGTEXT NULL,
      ADD COLUMN \`connections_json\` LONGTEXT NULL,
      ADD COLUMN \`inspirations_json\` LONGTEXT NULL,
      ADD COLUMN \`evidences_json\` LONGTEXT NULL,
      ADD COLUMN \`purchase_url\` VARCHAR(500) NULL,
      ADD COLUMN \`version\` INT UNSIGNED NOT NULL DEFAULT 1,
      ADD COLUMN \`last_edited_by_id\` BIGINT UNSIGNED NULL,
      ADD KEY \`IDX_articles_featured\` (\`featured\`),
      ADD KEY \`IDX_articles_location\` (\`location_name\`)`);

    // ── Revisões ───────────────────────────────────────────────────────
    await q.query(`CREATE TABLE IF NOT EXISTS \`article_revisions\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`article_id\` BIGINT UNSIGNED NOT NULL,
      \`version\` INT UNSIGNED NOT NULL,
      \`reason\` VARCHAR(20) NOT NULL,
      \`title\` VARCHAR(200) NOT NULL,
      \`content_html\` LONGTEXT NOT NULL,
      \`content_json\` LONGTEXT NULL,
      \`meta_json\` LONGTEXT NULL,
      \`created_by_id\` BIGINT UNSIGNED NULL,
      \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      KEY \`IDX_revisions_article\` (\`article_id\`, \`created_at\`),
      CONSTRAINT \`FK_revisions_article\` FOREIGN KEY (\`article_id\`) REFERENCES \`articles\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // ── Redirecionamento de slugs alterados ────────────────────────────
    await q.query(`CREATE TABLE IF NOT EXISTS \`slug_redirects\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`old_slug\` VARCHAR(191) NOT NULL,
      \`article_id\` BIGINT UNSIGNED NOT NULL,
      \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`UQ_slug_redirects_old\` (\`old_slug\`),
      CONSTRAINT \`FK_redirects_article\` FOREIGN KEY (\`article_id\`) REFERENCES \`articles\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // ── Visualizações por dia (gráfico real do dashboard) ──────────────
    await q.query(`CREATE TABLE IF NOT EXISTS \`article_daily_views\` (
      \`article_id\` BIGINT UNSIGNED NOT NULL,
      \`day\` DATE NOT NULL,
      \`views\` INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (\`article_id\`, \`day\`),
      KEY \`IDX_daily_views_day\` (\`day\`),
      CONSTRAINT \`FK_daily_views_article\` FOREIGN KEY (\`article_id\`) REFERENCES \`articles\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // ── Mídia ──────────────────────────────────────────────────────────
    await q.query(`ALTER TABLE \`file_assets\`
      MODIFY \`mime_type\` VARCHAR(100) NOT NULL,
      ADD COLUMN \`kind\` VARCHAR(20) NOT NULL DEFAULT 'image',
      ADD COLUMN \`title\` VARCHAR(255) NULL,
      ADD COLUMN \`alt_text\` VARCHAR(300) NULL,
      ADD COLUMN \`caption\` VARCHAR(500) NULL,
      ADD COLUMN \`credit\` VARCHAR(200) NULL,
      ADD COLUMN \`source_url\` VARCHAR(500) NULL,
      ADD COLUMN \`ai_generated\` TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN \`ai_prompt\` TEXT NULL,
      ADD COLUMN \`ai_model\` VARCHAR(150) NULL,
      ADD COLUMN \`width\` INT UNSIGNED NULL,
      ADD COLUMN \`height\` INT UNSIGNED NULL,
      ADD COLUMN \`sha256\` CHAR(64) NULL,
      ADD COLUMN \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      ADD KEY \`IDX_assets_sha256\` (\`sha256\`),
      ADD KEY \`IDX_assets_kind\` (\`kind\`)`);

    // ── Histórico de gerações de IA ────────────────────────────────────
    await q.query(`CREATE TABLE IF NOT EXISTS \`ai_generations\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`job_id\` VARCHAR(64) NOT NULL,
      \`kind\` VARCHAR(20) NOT NULL,
      \`status\` VARCHAR(20) NOT NULL,
      \`provider\` VARCHAR(30) NULL,
      \`model\` VARCHAR(150) NULL,
      \`article_id\` BIGINT UNSIGNED NULL,
      \`prompt_summary\` VARCHAR(500) NULL,
      \`attempts_json\` LONGTEXT NULL,
      \`tokens_in\` INT UNSIGNED NULL,
      \`tokens_out\` INT UNSIGNED NULL,
      \`cost_usd\` DECIMAL(12,6) NULL,
      \`error_message\` VARCHAR(1000) NULL,
      \`duration_ms\` INT UNSIGNED NULL,
      \`created_by_id\` BIGINT UNSIGNED NULL,
      \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`UQ_ai_generations_job\` (\`job_id\`),
      KEY \`IDX_ai_generations_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // ── Relatos enviados pelos leitores ────────────────────────────────
    await q.query(`CREATE TABLE IF NOT EXISTS \`reader_reports\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`title\` VARCHAR(200) NOT NULL,
      \`summary\` VARCHAR(500) NULL,
      \`narrative\` TEXT NOT NULL,
      \`location_name\` VARCHAR(200) NULL,
      \`region\` VARCHAR(100) NULL,
      \`phenomenon_type\` VARCHAR(100) NULL,
      \`anonymous\` TINYINT(1) NOT NULL DEFAULT 0,
      \`reporter_user_id\` BIGINT UNSIGNED NULL,
      \`status\` ENUM('PENDING','APPROVED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'PENDING',
      \`admin_notes\` TEXT NULL,
      \`ip_hash\` VARCHAR(64) NULL,
      \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      KEY \`IDX_reports_status\` (\`status\`, \`created_at\`),
      CONSTRAINT \`FK_reports_user\` FOREIGN KEY (\`reporter_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `reader_reports`');
    await q.query('DROP TABLE IF EXISTS `ai_generations`');
    await q.query('DROP TABLE IF EXISTS `article_daily_views`');
    await q.query('DROP TABLE IF EXISTS `slug_redirects`');
    await q.query('DROP TABLE IF EXISTS `article_revisions`');
    await q.query(`ALTER TABLE \`file_assets\`
      DROP KEY \`IDX_assets_kind\`, DROP KEY \`IDX_assets_sha256\`,
      DROP COLUMN \`updated_at\`, DROP COLUMN \`sha256\`, DROP COLUMN \`height\`, DROP COLUMN \`width\`,
      DROP COLUMN \`ai_model\`, DROP COLUMN \`ai_prompt\`, DROP COLUMN \`ai_generated\`, DROP COLUMN \`source_url\`,
      DROP COLUMN \`credit\`, DROP COLUMN \`caption\`, DROP COLUMN \`alt_text\`, DROP COLUMN \`title\`, DROP COLUMN \`kind\``);
    // Volta artigos REVIEW/TRASH para DRAFT antes de reduzir o ENUM (não perde linhas)
    await q.query(`UPDATE \`articles\` SET \`status\`='DRAFT' WHERE \`status\` IN ('REVIEW','TRASH')`);
    await q.query(`ALTER TABLE \`articles\`
      DROP KEY \`IDX_articles_location\`, DROP KEY \`IDX_articles_featured\`,
      DROP COLUMN \`last_edited_by_id\`, DROP COLUMN \`version\`, DROP COLUMN \`purchase_url\`,
      DROP COLUMN \`evidences_json\`, DROP COLUMN \`inspirations_json\`, DROP COLUMN \`connections_json\`,
      DROP COLUMN \`attachments_json\`, DROP COLUMN \`timeline_json\`, DROP COLUMN \`censored_json\`,
      DROP COLUMN \`is_fiction\`, DROP COLUMN \`dossier_summary\`, DROP COLUMN \`event_date\`, DROP COLUMN \`entity_name\`,
      DROP COLUMN \`phenomenon_type\`, DROP COLUMN \`longitude\`, DROP COLUMN \`latitude\`, DROP COLUMN \`location_name\`,
      DROP COLUMN \`case_status\`, DROP COLUMN \`case_number\`, DROP COLUMN \`classification_level\`,
      DROP COLUMN \`robots_index\`, DROP COLUMN \`twitter_card\`, DROP COLUMN \`og_image_url\`, DROP COLUMN \`og_description\`,
      DROP COLUMN \`og_title\`, DROP COLUMN \`canonical_url\`, DROP COLUMN \`seo_keywords_json\`, DROP COLUMN \`seo_focus_keyword\`,
      DROP COLUMN \`trashed_at\`, DROP COLUMN \`previous_status\`, DROP COLUMN \`featured\`, DROP COLUMN \`content_json\`,
      DROP COLUMN \`subtitle\`,
      MODIFY \`status\` ENUM('DRAFT','PUBLISHED','SCHEDULED','ARCHIVED') NOT NULL DEFAULT 'DRAFT'`);
  }
}
