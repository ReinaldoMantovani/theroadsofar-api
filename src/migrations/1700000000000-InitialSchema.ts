import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`email\` VARCHAR(191) NOT NULL,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`roles\` SET('ADMIN','AUTHOR','READER') NOT NULL DEFAULT 'READER',
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`email_verified\` TINYINT(1) NOT NULL DEFAULT 0,
        \`email_verification_token\` VARCHAR(255) NULL,
        \`refresh_token_hash\` VARCHAR(255) NULL,
        \`consent_terms_at\` DATETIME NULL,
        \`consent_privacy_at\` DATETIME NULL,
        \`deleted_at\` DATETIME NULL,
        \`deletion_reason\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY \`UQ_users_email\` (\`email\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user_profiles\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`display_name\` VARCHAR(60) NOT NULL,
        \`username\` VARCHAR(60) NULL,
        \`avatar_url\` VARCHAR(500) NULL,
        \`bio\` TEXT NULL,
        \`website_url\` VARCHAR(500) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY \`UQ_profiles_user_id\` (\`user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_profiles_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`file_assets\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`filename\` VARCHAR(255) NOT NULL,
        \`original_name\` VARCHAR(255) NOT NULL,
        \`mime_type\` VARCHAR(50) NOT NULL,
        \`size\` BIGINT UNSIGNED NOT NULL,
        \`url\` TEXT NOT NULL,
        \`uploaded_by_id\` BIGINT UNSIGNED NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_assets_user\` FOREIGN KEY (\`uploaded_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`articles\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`slug\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(200) NOT NULL,
        \`excerpt\` TEXT NULL,
        \`content_html\` LONGTEXT NOT NULL,
        \`cover_url\` VARCHAR(500) NULL,
        \`status\` ENUM('DRAFT','PUBLISHED','SCHEDULED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
        \`published_at\` DATETIME NULL,
        \`scheduled_at\` DATETIME NULL,
        \`author_id\` BIGINT UNSIGNED NOT NULL,
        \`tags_json\` JSON NOT NULL DEFAULT (JSON_ARRAY()),
        \`categories_json\` JSON NOT NULL DEFAULT (JSON_ARRAY()),
        \`seo_title\` VARCHAR(70) NULL,
        \`seo_description\` VARCHAR(160) NULL,
        \`view_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`like_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`share_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`comment_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`read_time_minutes\` TINYINT UNSIGNED NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME NULL,
        UNIQUE KEY \`UQ_articles_slug\` (\`slug\`),
        KEY \`IDX_articles_status_published\` (\`status\`, \`published_at\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_articles_author\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`comments\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`article_id\` BIGINT UNSIGNED NOT NULL,
        \`author_id\` BIGINT UNSIGNED NULL,
        \`guest_name\` VARCHAR(60) NULL,
        \`content\` TEXT NOT NULL,
        \`status\` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        \`ip_hash\` VARCHAR(64) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME NULL,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_comments_article\` (\`article_id\`),
        CONSTRAINT \`FK_comments_article\` FOREIGN KEY (\`article_id\`) REFERENCES \`articles\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_comments_author\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`audit_logs\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`action\` VARCHAR(100) NOT NULL,
        \`resource_type\` VARCHAR(50) NULL,
        \`resource_id\` VARCHAR(50) NULL,
        \`ip_anonymized\` VARCHAR(20) NULL,
        \`metadata\` JSON NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_audit_user\` (\`user_id\`),
        KEY \`IDX_audit_action\` (\`action\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `audit_logs`');
    await queryRunner.query('DROP TABLE IF EXISTS `comments`');
    await queryRunner.query('DROP TABLE IF EXISTS `articles`');
    await queryRunner.query('DROP TABLE IF EXISTS `file_assets`');
    await queryRunner.query('DROP TABLE IF EXISTS `user_profiles`');
    await queryRunner.query('DROP TABLE IF EXISTS `users`');
  }
}
