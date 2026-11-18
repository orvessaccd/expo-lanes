import { Box, Container, Typography, Paper } from "@mui/material";

export default function HomePage() {
  return (
    <Box component="main" sx={{ py: 6 }}>
      <Container maxWidth="lg">
        <Paper sx={{ p: 4 }}>
          <Typography variant="h1" gutterBottom>
            Expo-Lanes · 纯数字指数赛道实验室
          </Typography>
          <Typography variant="body1" color="text.secondary">
            纯数学指数物理模拟引擎与竞猜沙盒正在构建中…
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
