-- Poll Windows RDP readiness every minute after Windows install records are created.
UPDATE jobs
SET interval_seconds = 60,
    updated_at = CURRENT_TIMESTAMP,
    description = 'Windows 安装完成回调超时兜底提醒与 RDP 每分钟可用检测'
WHERE name = 'windows_install_timeout';
