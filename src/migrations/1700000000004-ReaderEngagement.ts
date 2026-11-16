import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Interação dos leitores:
 * - favoritos (curtidas) de artigos, um por usuário
 * - curtidas em comentários, uma por usuário, com contador no comentário
 *
 * Incremental: só adiciona tabelas e uma coluna. Nenhum dado existente é apagado.
 */
export class ReaderEngagement1700000000004 implements MigrationInterface {
  name = 'ReaderEngagement1700000000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`article_likes\` (
        \`article_id\` BIGINT UNSIGNED NOT NULL,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`article_id\`, \`user_id\`),
        KEY \`idx_article_likes_user\` (\`user_id\`, \`created_at\`),
        CONSTRAINT \`fk_article_likes_article\` FOREIGN KEY (\`article_id\`) REFERENCES \`articles\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_article_likes_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`comment_likes\` (
        \`comment_id\` BIGINT UNSIGNED NOT NULL,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`comment_id\`, \`user_id\`),
        KEY \`idx_comment_likes_user\` (\`user_id\`),
        CONSTRAINT \`fk_comment_likes_comment\` FOREIGN KEY (\`comment_id\`) REFERENCES \`comments\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_comment_likes_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query('ALTER TABLE `comments` ADD COLUMN `like_count` INT UNSIGNED NOT NULL DEFAULT 0');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `comments` DROP COLUMN `like_count`');
    await q.query('DROP TABLE IF EXISTS `comment_likes`');
    await q.query('DROP TABLE IF EXISTS `article_likes`');
  }
}
