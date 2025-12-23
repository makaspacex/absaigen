from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='MediaRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('media_type', models.CharField(choices=[('image', 'Image'), ('audio', 'Audio'), ('video', 'Video')], max_length=10)),
                ('model', models.CharField(max_length=100)),
                ('prompt', models.TextField(blank=True)),
                ('style', models.CharField(blank=True, max_length=100)),
                ('voice', models.CharField(blank=True, max_length=100)),
                ('file', models.FileField(blank=True, null=True, upload_to='outputs/')),
                ('result_url', models.URLField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]
