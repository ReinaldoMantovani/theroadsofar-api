-- Inicialização do banco de dados para desenvolvimento
-- Este arquivo é executado apenas na primeira criação do container

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Configurações de charset para o banco
ALTER DATABASE theroadsofar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- As tabelas são criadas pelas migrations do TypeORM
-- Este arquivo apenas garante o charset correto
